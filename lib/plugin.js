/* eslint-disable import/no-extraneous-dependencies */
const Promise = require('bluebird');
const Chunk = require('webpack/lib/Chunk');
const SVGBaker = require('svg-baker');
const Sprite = require('svg-baker/lib/Sprite'); // eslint-disable-line import/no-unresolved

const NAMESPACE = require('./loader').NAMESPACE;
const utils = require('./utils');

let ExtractedModule;

try {
  // eslint-disable-next-line global-require
  ExtractedModule = require('extract-text-webpack-plugin/ExtractedModule');
} catch (e) {
  ExtractedModule = null;
}

class SVGSpritePlugin {
  constructor() {
    this.store = new SVGBaker();
  }

  // eslint-disable-next-line class-methods-use-this
  get NAMESPACE() {
    return NAMESPACE;
  }

  addSymbol(symbol) {
    return this.store.addSymbol(symbol);
  }

  apply(compiler) {
    const plugin = this;
    const { symbols } = this.store;

    // Handle only main compilation
    compiler.plugin('this-compilation', (compilation) => {
      // Share store with loader
      compilation.plugin('normal-module-loader', (loaderContext) => {
        loaderContext[NAMESPACE] = plugin;
      });

      // Replace placeholders with real URL to symbol (in modules processed by sprite-loader)
      compilation.plugin('after-optimize-chunks', function replacePlaceholdersInModules() {
        const map = utils.aggregate(symbols, this);
        const replacements = map.reduce((aac, item) => {
          aac[item.resource] = item.url;
          return aac;
        }, {});

        map.forEach(item => utils.replaceInModuleSource(item.module, replacements));
      });

      // Replace placeholders with real URL to symbol (in modules extracted by extract-text-webpack-plugin)
      compilation.plugin('optimize-extracted-chunks', function replacePlaceholdersInExtractedChunks(chunks) {
        const map = utils.aggregate(symbols, this);
        const replacements = map.reduce((aac, item) => {
          aac[item.resource] = item.useUrl;
          return aac;
        }, {});

        chunks.forEach((chunk) => {
          chunk.modules
            .filter(module => module instanceof ExtractedModule)
            .forEach(module => utils.replaceInModuleSource(module, replacements));
        });
      });

      // Create sprite chunk
      compilation.plugin('additional-assets', function emitSpriteChunks(done) {
        const sprites = utils.groupSymbolsBySprites(utils.aggregate(symbols, this));
        const filenames = Object.keys(sprites);

        return Promise.map(filenames, (spriteFilename) => {
          const spriteSymbols = sprites[spriteFilename];

          return Sprite.create({ symbols: spriteSymbols, filename: spriteFilename })
            .then((sprite) => {
              const content = sprite.render();
              const chunk = new Chunk(spriteFilename);
              chunk.ids = [];
              chunk.files.push(spriteFilename);

              compilation.assets[spriteFilename] = {
                source() { return content; },
                size() { return content.length; }
              };

              compilation.chunks.push(chunk);
            });
        })
          .then(() => done())
          .catch(e => done(e));
      });
    });
  }
}

module.exports = SVGSpritePlugin;