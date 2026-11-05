#!/usr/bin/env python3
"""Reconstruit et signe l'APK Tchatz Klassio à partir des fichiers extraits.

- Réassemble le ZIP (resources.arsc et bibliothèques natives stockés non compressés
  et alignés, comme l'exige Android avec extractNativeLibs=false).
- Corrige le drapeau « debuggable » du manifeste binaire (build propre).
- Signe en v1 (JAR) + v2 (APK Signature Scheme v2) avec une clé auto-signée.
- Vérifie le résultat avec apksigtool.

Usage : python3 tools/build_apk.py
"""
import base64
import hashlib
import os
import struct
import sys
import zlib
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "public", "klassio.apk")
KEY_PATH = os.path.join(ROOT, "tools", "klassio-signing.pem")
CHUNK = 1048576
V2_BLOCK_ID = 0x7109871A
SIG_ALGO = 0x0103  # RSASSA-PKCS1-v1_5 with SHA-256


# --------------------------------------------------------------------- manifeste
def patch_debuggable(data: bytes) -> bytes:
    """Passe android:debuggable de true à false dans l'AXML binaire."""
    buf = bytearray(data)
    # Localise l'index de la chaîne "debuggable" dans le pool de chaînes.
    # Chunk pool : type 0x0001 à l'offset 8.
    pos = 8
    assert struct.unpack_from("<H", buf, pos)[0] == 0x0001
    string_count = struct.unpack_from("<I", buf, pos + 8)[0]
    flags = struct.unpack_from("<I", buf, pos + 16)[0]
    strings_start = struct.unpack_from("<I", buf, pos + 20)[0]
    utf8 = bool(flags & 0x100)
    offsets_base = pos + 28
    data_base = pos + strings_start

    def read_string(idx):
        off = data_base + struct.unpack_from("<I", buf, offsets_base + idx * 4)[0]
        if utf8:
            # deux longueurs uleb128-like (chars puis bytes)
            n = buf[off]; off += 1
            if n & 0x80:
                off += 1
            m = buf[off]; off += 1
            if m & 0x80:
                m = ((m & 0x7F) << 8) | buf[off]; off += 1
            return buf[off:off + m].decode("utf-8", "replace")
        else:
            n = struct.unpack_from("<H", buf, off)[0]; off += 2
            if n & 0x8000:
                n = ((n & 0x7FFF) << 16) | struct.unpack_from("<H", buf, off)[0]; off += 2
            return buf[off:off + n * 2].decode("utf-16-le", "replace")

    target = None
    for i in range(string_count):
        if read_string(i) == "debuggable":
            target = i
            break
    if target is None:
        print("  (debuggable introuvable, inchangé)")
        return data

    # Parcourt les chunks START_TAG (0x0102) et cherche l'attribut.
    # Le chunk XML racine (0x0003) enveloppe tout le fichier : on démarre à 8.
    p = 8
    patched = False
    while p + 8 <= len(buf):
        ctype, hsize, csize = struct.unpack_from("<HHI", buf, p)
        if csize == 0:
            break
        if ctype == 0x0102:  # START_TAG
            attr_count = struct.unpack_from("<H", buf, p + 28)[0]
            attr_base = p + 36
            for a in range(attr_count):
                ao = attr_base + a * 20
                name_idx = struct.unpack_from("<I", buf, ao + 4)[0]
                if name_idx == target:
                    dtype = buf[ao + 15]
                    if dtype == 0x12:  # INT_BOOLEAN
                        struct.pack_into("<I", buf, ao + 16, 0)
                        patched = True
        p += csize
    print("  debuggable -> false" if patched else "  (debuggable non modifié)")
    return bytes(buf)


# --------------------------------------------------------------------- ZIP manuel
def dos_time():
    now = datetime.now()
    time = (now.hour << 11) | (now.minute << 5) | (now.second // 2)
    date = ((now.year - 1980) << 9) | (now.month << 5) | now.day
    return time, date


def deflate(data):
    co = zlib.compressobj(9, zlib.DEFLATED, -15)
    return co.compress(data) + co.flush()


def build_zip(entries):
    """entries: liste de (nom, données, compression, alignement). Renvoie le ZIP."""
    out = bytearray()
    central = bytearray()
    t, d = dos_time()
    count = 0
    for name, data, comp, align in entries:
        name_b = name.encode("utf-8")
        crc = zlib.crc32(data) & 0xFFFFFFFF
        stored = comp == 0
        payload = data if stored else deflate(data)
        offset = len(out)
        extra = b""
        if stored and align > 1:
            base = offset + 30 + len(name_b)
            need = (align - base % align) % align
            if 0 < need < 4:
                need += align
            if need >= 4:
                extra = struct.pack("<HH", 0xD935, need - 4) + b"\x00" * (need - 4)
        local = struct.pack(
            "<IHHHHHIIIHH",
            0x04034B50, 20, 0, comp, t, d, crc, len(payload), len(data), len(name_b), len(extra),
        )
        out += local + name_b + extra + payload
        central += struct.pack(
            "<IHHHHHHIIIHHHHHII",
            0x02014B50, 20, 20, 0, comp, t, d, crc, len(payload), len(data),
            len(name_b), 0, 0, 0, 0, 0, offset,
        ) + name_b
        count += 1
    cd_offset = len(out)
    out += central
    eocd = struct.pack(
        "<IHHHHIIH", 0x06054B50, 0, 0, count, count, len(central), cd_offset, 0
    )
    out += eocd
    return bytes(out), cd_offset


# --------------------------------------------------------------------- clé / certificat
def load_or_create_key():
    if os.path.exists(KEY_PATH):
        blob = open(KEY_PATH, "rb").read()
        key = serialization.load_pem_private_key(blob, password=None)
        cert = x509.load_pem_x509_certificate(blob)
        return key, cert
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Tchatz Klassio"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Tchatz"),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "BJ"),
    ])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject).issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=365 * 30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ) + cert.public_bytes(serialization.Encoding.PEM)
    with open(KEY_PATH, "wb") as f:
        f.write(pem)
    os.chmod(KEY_PATH, 0o600)
    return key, cert


# --------------------------------------------------------------------- signature v1
def v1_sign(entries, key, cert):
    """Renvoie les fichiers META-INF (MANIFEST.MF, CERT.SF, CERT.RSA)."""
    def is_sig(name):
        u = name.upper()
        return u.startswith("META-INF/") and (
            u.endswith((".SF", ".RSA", ".DSA", ".EC")) or u == "META-INF/MANIFEST.MF"
            or u.startswith("META-INF/SIG-")
        )

    sections = []
    for name, data, _, _ in entries:
        if is_sig(name):
            continue
        digest = base64.b64encode(hashlib.sha256(data).digest()).decode()
        sections.append((name, f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n"))

    manifest = "Manifest-Version: 1.0\r\nCreated-By: 1.0 (Android)\r\n\r\n"
    manifest += "".join(s for _, s in sections)
    manifest_b = manifest.encode("utf-8")

    sf = "Signature-Version: 1.0\r\n"
    sf += "SHA-256-Digest-Manifest: " + base64.b64encode(hashlib.sha256(manifest_b).digest()).decode() + "\r\n"
    sf += "Created-By: 1.0 (Android)\r\n\r\n"
    for name, section in sections:
        digest = base64.b64encode(hashlib.sha256(section.encode("utf-8")).digest()).decode()
        sf += f"Name: {name}\r\nSHA-256-Digest: {digest}\r\n\r\n"
    sf_b = sf.encode("utf-8")

    rsa_sig = (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(sf_b)
        .add_signer(cert, key, hashes.SHA256())
        .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature])
    )
    return [
        ("META-INF/MANIFEST.MF", manifest_b, 8, 1),
        ("META-INF/CERT.SF", sf_b, 8, 1),
        ("META-INF/CERT.RSA", rsa_sig, 8, 1),
    ]


# --------------------------------------------------------------------- signature v2
def lp(data):
    return struct.pack("<I", len(data)) + data


def chunk_digest(chunk):
    return hashlib.sha256(b"\xa5" + struct.pack("<I", len(chunk)) + chunk).digest()


def apk_digest(zip_bytes, sb_offset):
    # EOCD
    eocd = zip_bytes.rfind(b"PK\x05\x06")
    cd_offset = struct.unpack_from("<I", zip_bytes, eocd + 16)[0]
    digests = []

    def section(start, end):
        size = end - start
        pos = start
        while size > 0:
            n = min(size, CHUNK)
            digests.append(chunk_digest(zip_bytes[pos:pos + n]))
            pos += n
            size -= n

    section(0, sb_offset)                      # 1. entrées ZIP
    section(cd_offset, eocd)                   # 2. répertoire central
    eocd_data = bytearray(zip_bytes[eocd:])    # 3. EOCD (offset CD remplacé)
    struct.pack_into("<I", eocd_data, 16, sb_offset)
    pos = 0
    while pos < len(eocd_data):
        digests.append(chunk_digest(bytes(eocd_data[pos:pos + CHUNK])))
        pos += CHUNK
    top = b"\x5a" + struct.pack("<I", len(digests)) + b"".join(digests)
    return hashlib.sha256(top).digest()


def v2_sign(zip_bytes, sb_offset, key, cert):
    digest = apk_digest(zip_bytes, sb_offset)
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pubkey_der = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    signed_data = (
        lp(lp(struct.pack("<I", SIG_ALGO) + lp(digest)))   # digests
        + lp(lp(cert_der))                                  # certificates
        + lp(b"")                                           # additional attributes
    )
    signature = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signer = (
        lp(signed_data)
        + lp(lp(struct.pack("<I", SIG_ALGO) + lp(signature)))
        + lp(pubkey_der)
    )
    signers = struct.pack("<I", len(lp(signer))) + lp(signer)
    pair_value = signers
    pair = struct.pack("<QI", len(pair_value) + 4, V2_BLOCK_ID) + pair_value
    size = len(pair) + 24
    block = struct.pack("<Q", size) + pair + struct.pack("<Q", size) + b"APK Sig Block 42"
    return block


def insert_v2(zip_bytes, sb_offset, block):
    new_cd_offset = sb_offset + len(block)
    out = bytearray(zip_bytes[:sb_offset] + block + zip_bytes[sb_offset:])
    eocd = out.rfind(b"PK\x05\x06")
    struct.pack_into("<I", out, eocd + 16, new_cd_offset)
    return bytes(out)


# --------------------------------------------------------------------- principal
def collect_entries():
    entries = []
    # Ordre conventionnel : manifeste, dex, ressources, puis le reste.
    priority = ["AndroidManifest.xml"] + [f"classes{i}.dex" for i in [""] + list(range(2, 14))] + ["resources.arsc"]
    files = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in (".git", "web", "tools", "node_modules")]
        rel_base = os.path.relpath(base, ROOT)
        for n in names:
            rel = os.path.normpath(os.path.join(rel_base, n)).replace(os.sep, "/")
            if rel.startswith((".git/", "web/", "tools/")):
                continue
            files.append(rel)
    files = sorted(set(files), key=lambda f: (priority.index(f) if f in priority else 999, f))
    for rel in files:
        full = os.path.join(ROOT, rel)
        data = open(full, "rb").read()
        if rel == "AndroidManifest.xml":
            data = patch_debuggable(data)
        if rel == "resources.arsc":
            comp, align = 0, 4
        elif rel.endswith(".so"):
            comp, align = 0, 16384
        else:
            comp, align = 8, 1
        entries.append((rel, data, comp, align))
    return entries


def main():
    print("→ Collecte des fichiers de l'APK…")
    entries = collect_entries()
    print(f"  {len(entries)} fichiers")
    key, cert = load_or_create_key()
    print("→ Signature v1 (JAR)…")
    entries += v1_sign(entries, key, cert)
    print("→ Assemblage du ZIP (alignement natif)…")
    zip_bytes, cd_offset = build_zip(entries)
    print("→ Signature v2 (APK Signature Scheme)…")
    block = v2_sign(zip_bytes, cd_offset, key, cert)
    apk = insert_v2(zip_bytes, cd_offset, block)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(apk)
    print(f"→ APK écrit : {OUT} ({len(apk) / 1e6:.1f} Mo)")

    # Vérifications
    import zipfile
    import io
    zf = zipfile.ZipFile(io.BytesIO(apk))
    bad = zf.testzip()
    print("→ ZIP intègre" if bad is None else f"→ ZIP CORROMPU : {bad}")
    import apksigtool
    from apksigcopier import extract_v2_sig
    sb_off, sig_block = extract_v2_sig(OUT)
    parsed = apksigtool.parse_apk_signing_block(sig_block, OUT)
    for pair in parsed.pairs:
        b = pair.value
        if isinstance(b, apksigtool.APKSignatureSchemeBlock):
            print(f"→ v{b.version} vérifié : {b.verified}")
            if not b.verified:
                sys.exit(1)
    print("✓ APK signé et vérifié.")


if __name__ == "__main__":
    main()
