// import { defineConfig } from 'vite'
// import glsl from 'vite-plugin-glsl'

// export default defineConfig({
//   plugins: [
//     glsl({
//       include: /\.(glsl|wgsl|vert|frag|vs|fs)$/,
//       compress: true,
//     }),
//   ],
// })

import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [glsl()],
});
