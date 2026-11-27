/* A starter list of Google Fonts families. Any other Google Fonts family name can be typed in. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiseUp = Object.assign(root.RiseUp || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SUGGESTED_FONTS = [
    // Sans serif
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Source Sans 3',
    'Work Sans', 'DM Sans', 'Raleway', 'Rubik', 'Manrope', 'Figtree', 'Atkinson Hyperlegible',
    'Lexend', 'Mulish', 'Outfit', 'Plus Jakarta Sans', 'IBM Plex Sans',
    // Serif
    'Merriweather', 'Lora', 'Playfair Display', 'Libre Baskerville', 'Source Serif 4', 'EB Garamond',
    'Crimson Pro', 'Fraunces', 'Bitter', 'Roboto Slab',
    // Display and handwriting
    'Bebas Neue', 'Oswald', 'Archivo Black', 'Abril Fatface', 'Lobster', 'Pacifico',
    'Caveat', 'Permanent Marker', 'Kalam', 'Shadows Into Light',
    // Monospace
    'JetBrains Mono', 'Fira Code', 'Space Mono',
  ];
  return { SUGGESTED_FONTS };
});
