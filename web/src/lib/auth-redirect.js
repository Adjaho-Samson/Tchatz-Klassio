// Le routeur et Supabase utilisent tous deux le fragment URL. Les anciens liens
// peuvent contenir « #/reinitialiser#access_token=… » : Supabase ne lit alors
// pas le premier paramètre. Normaliser avant la création du client Auth.
export function normalizeAuthCallback(href) {
  const url = new URL(href);
  const fragment = url.hash.slice(1);
  const nested = fragment.match(/^\/reinitialiser#(.+)$/);
  const params = new URLSearchParams(nested ? nested[1] : fragment);
  const isAuth = params.has('access_token') || params.has('error') || params.has('error_code');
  const recovery = isAuth && (params.get('type') === 'recovery' || Boolean(nested) || params.has('error') || params.has('error_code'));
  if (nested && isAuth) url.hash = nested[1];
  return { href: url.href, recovery, changed: Boolean(nested && isAuth) };
}
