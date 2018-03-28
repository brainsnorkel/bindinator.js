/**
# Make Stylesheet

Usage:

    const makeStylesheet = ('path/to/makeStylesheet.js');
    makeStylesheet('h1 { font-size: 100px; }', 'my style sheet');

Inserts the source in a `<style>` tag and sticks in in the document head. It will have the
supplied title as its `data-title` attribute;
*/
/* global module, require */
'use strict';

const {create, text, findOne} = require('./b8r.dom.js');

module.exports = (source, title) => {
  const style = source ? create('style') : false;
  if (style) {
    style.type = 'text/css';
    style.dataset.title = title;
    style.appendChild(text(source));
    document.head.appendChild(style);
  }
  return style;
};

module.exports.viaLink = href => {
  if (! findOne(`link[href="${href}"]`)) {
    const link = create('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    document.head.append(link);
  }
}
