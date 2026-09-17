/* Public Supabase configuration.

   When the site is served by the Qurama server this file is generated from the
   environment, so what is committed here is only a placeholder for opening the
   pages straight off the file system.

   The anon key is *meant* to be public. Row level security is what protects the
   data: it permits reading published entries and nothing else. The service role
   key is the one that must never appear in a browser.  */

window.QURAMA_CONFIG = {
  supabaseUrl: null,
  supabaseAnonKey: null,
};
