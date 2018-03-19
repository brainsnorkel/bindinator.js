/**
# particle-controller

full-screen particles for fun and profit

Usage:

    const ps = require('particle-controller.js');
    ps.spawnAt(event.clientX, event.clientY, "👍");


*/

/* global THREE, TWEEN, require */
'use strict';

const b8r = require('../source/b8r.js');
const particleController = {};
const charCanvas = char => {
    var canvas = document.createElement( 'canvas' );
    canvas.width = 64;
    canvas.height = 64;
    var g = canvas.getContext( '2d' );
    g.font = '60px sans-serif';
    g.textAlign = 'center';
    g.fillText(char, 32, 60);
    return canvas;
};

const _glyph_mats = {}; // glyph -> material
const glyph2mat = glyph => {
  let mat = _glyph_mats[glyph];
  if (!mat) {
    const c = glyph instanceof HTMLCanvasElement ? glyph : charCanvas(glyph),
          t = new THREE.CanvasTexture(c);
    mat = new THREE.SpriteMaterial({map: t});
  }
  if (typeof glyph === 'string') {
    _glyph_mats[glyph] = mat;
  }
  return mat;
};

const mat2sprite = material => new THREE.Sprite(material.clone());

let camera, scene;

const initParticle = ( { delay=0, start, scale, destination, fadein=0.25, fadeout=0.5, lifespan=2000 }, particle) => {
  particle = this instanceof THREE.Sprite ? this : particle;
  particle.position.set( start.x, start.y, start.z );
  particle.scale.x = particle.scale.y = scale;

  new TWEEN.Tween( particle.position ).
  delay( delay ).
  to(destination, lifespan).
  onComplete(() => scene.remove(particle)).
  start();

  if (fadein > 0) {
    particle.material.opacity = 0;
  }
  if (fadein > 0 || fadeout >= fadein) {
    new TWEEN.Tween( particle.material ).
    delay(delay).
    to({opacity: 1}, lifespan * fadein).
    onComplete(() => {
      if (fadeout >= fadein) {
        new TWEEN.Tween( particle.material ).
        delay(lifespan * (fadeout - fadein)).
        to({opacity: 0}, lifespan * (1 - fadeout)).
        start();
      }
    }).
    start();
  }

  scene.add(particle);
};

const lerp = (a, b, t) => {
  if (typeof a === 'object') {
    const interpolated = {};
    Object.keys(a).forEach(key => {
      interpolated[key] = lerp(a[key], b[key], t);
    });
    return interpolated;
  } else {
    return a * (1 - t) + b * t;
  }
};

const particleSequence = ({ delay=0, start, scale, fadein=0.25, fadeout=0.5, destination, lifespan=2000 }, particles) => {
  lifespan = lifespan / particles.length;
  particles.forEach((particle, idx) => {
    initParticle({
      delay: idx === 0 ? delay : delay + idx * lifespan,
      start: lerp(start, destination, idx / particles.length),
      scale,
      fadein: particles.length > 1 && idx > 0 ? 0.1 : Math.min(fadein, 1/particles.length),
      fadeout: idx + 1 < particles.length ? 0.9 : Math.max(fadein, 1 - 1/particles.length),
      destination: lerp(start, destination, (idx + 1)/ particles.length),
      lifespan: particles.length > 1 ? lifespan * 1.2 : lifespan,
    }, particle);
  });
};

setInterval(() => b8r.set('particle-controller.count', scene.children.length), 500);

require.lazy('../third-party/three.min.js').
then(() => require.lazy('../third-party/Tween.min.js')).
then(() => {
  const aspect_ratio = window.innerWidth/window.innerHeight;
  camera = new THREE.PerspectiveCamera( 90, aspect_ratio, 1, 5000 );
  camera.position.z = 1000;

  scene = new THREE.Scene();
  camera.lookAt( scene.position );
  const renderer = new THREE.WebGLRenderer({ alpha: true });
  const canvas = renderer.domElement;

  let rendering_active = false;
  const render = () => {
    if(b8r.isInBody(renderer.domElement)) {
      TWEEN.update();
      renderer.render( scene, camera );
      rendering_active = !! scene.children.length;
      if (rendering_active) requestAnimationFrame(render);
    }
  };

  Object.assign(particleController, {
    spawnAt: (x, y, glyphs, howmany=25, scale=48) => {
      document.body.appendChild( canvas );
      // initialize camera projection
      if (!rendering_active) {
        renderer.render(scene, camera);
      }

      const vector = new THREE.Vector3();
      vector.set(
          ( x / window.innerWidth ) * 2 - 1,
          - ( y / window.innerHeight ) * 2 + 1,
          0 );

      vector.unproject(camera);
      const projection_distance = camera.position.z / (camera.position.z - vector.z);
      const pos = vector.clone().multiplyScalar(projection_distance);
      pos.z = 0;

      const materials = (glyphs.map ? glyphs : [glyphs]).map(glyph2mat);

      for (let i = 0; i < howmany; i++ ) {
        const particles = materials.map(mat2sprite);
        const randomSize = Math.random() * scale + scale / 2;
        particleSequence( {
            delay: i * 50,
            start: pos,
            scale: randomSize,
            destination: {
              x: pos.x + Math.random() * 200 * randomSize/48 - 100,
              y: pos.y + Math.random() * 300 * randomSize/48 + 200,
              z: pos.z + Math.random() * 100 * randomSize/48
            }
          }, particles);
      }
      if (!rendering_active) {
        render();
      }
    },
  });

  b8r.register('particle-controller', particleController);

  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  canvas.dataset.info = 'particle-controller uses this';
  Object.assign(canvas.style, {
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 1000,
    pointerEvents: 'none',
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  });
});

module.exports = particleController;