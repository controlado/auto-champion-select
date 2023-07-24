import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { defineConfig } from "vite";
import pkg from "./package.json";

const banner = `/**
 * @author ${pkg.author}
 * @name ${pkg.name}
 * @link ${pkg.homepage}
 * @description ${pkg.description}
 * @version ${pkg.version}
 * @license ${pkg.license}
 */`;

export default defineConfig({
    plugins: [cssInjectedByJsPlugin()],
    build: {
        rollupOptions: {
            input: "src/index.js",
            output: {
                entryFileNames: "index.js",
                assetFileNames: "assets/[name][extname]",
                chunkFileNames: "chunks/[name][extname]",
            }
        },
    },
    esbuild: {
        banner: banner,
        legalComments: "none",
    },
});
