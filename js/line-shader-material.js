/**
 * @fileoverview Custom Line Shader Material for rendering the Geodetic Velocity
 * lines.
 *
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// Shader requires THREE.js.
if (typeof THREE === 'undefined') {
  throw Error('THREE.js is required to create an Overlay.');
}

var geovelo;
geovelo = geovelo || {};

/**
 * Custom Line Shader Material.
 *
 * This shader is the real workhorse of the visualization. For each beacon, at
 * each timestep (that is each day) we have one vertex. Vertices are joined by
 * line segments which collectively produce the visualization when rendered.
 *
 * The vertex shader is responsible for computing three things:
 *
 *   - The final position of the vertex.
 *   - The color of the vertex.
 *   - Whether the vertex is visible.
 *
 * Computing the final position of the vertex depends on:
 *
 *   - The base position for the beacon (its initial position).
 *   - The current timestamp (for z position).
 *   - The offset position for this day.
 *   - The offset position of the current "start" timestamp.
 *   - The median cumulative offset position for this day.
 *   - The scale (for magnification of geodetic velocity).
 *
 * Some of these values are the same for all vertices (uniforms) like scale.
 * Others are unique to the vertex (attributes) like the offset position.
 *
 * Any value that needs to be the same for a large number of vertices is
 * provided as a uniform, although some of these contain a lot of data. For
 * example, looking up the offset position of the current start timestamp
 * requires a texture (sampler2D) whose texels contain values and are indexed in
 * the u and v direction by the beacon index and day index.
 *
 * The color and visiblity of the vertices are passed through to the fragment
 * shader, which is comparatively simple. All it has to do is discard the
 * fragment if either vertex of the segment is not visible, and show the
 * interpolated color.
 *
 * @param {Object} parameters Parameters to send to the Material.
 */
geovelo.LineShaderMaterial = function(parameters) {

  THREE.ShaderMaterial.call(this);

  parameters = parameters || {};

  parameters.vertexShader = geovelo.LineShaderMaterial.VERTEX_SHADER;
  parameters.fragmentShader = geovelo.LineShaderMaterial.FRAGMENT_SHADER;

  /**
   * Uniforms are GLSL variables which have a uniform value across all of the
   * vertexes (and, subsequently, fragments) being rendered.
   */
  parameters.uniforms = {

    /**
     * Magnification to apply to each vertex position (relative to base).
     */
    scale: { type: 'f', value: 3e5 },

    /**
     * Amount of the cumulative median movement to subtract out at each step.
     * Should be a value from 0 (no correction) to 1 (subtract full amount).
     * This requires that cumulative medians have been computed and set in the
     * BeaconVertexTexture data. If not, it will have no effect.
     */
    medianCorrection: { type: 'f', value: 1 },

    /**
     * The beacon vertext texture contains all of the data about each beacon at
     * each timestamp for which we have data. It includes the original starting
     * position of the beacon as well as the cumulative median velocity for each
     * time index (timestamp - start timestamp).
     *
     * It is used in the vertex shader to compute the final position of the
     * beacon in Web Mercator projected coordinates just prior to applying the
     * modelview and projection matricies to get the screen coordinates.
     *
     * This must be set prior to rendering via setBeaconVertexTexture(), which
     * will also set up the min and max timestamps and dt/db uniforms.
     *
     * @see geovelo.BeaconVertexTexture.
     */
    beaconVertexTexture: { type: 't', value: null },

    /**
     * These timestamps indicate the earliest and latest timestamps of the
     * underlying data. They're used to compute the coordinates of the median
     * values to apply, and when looking up the cumulative offset for
     * recentering on a start timestamp.
     */
    minTimestamp: { type: 'f', value: 0 },
    maxTimestamp: { type: 'f', value: 0 },

    /**
     * dt and db are computed units used when peeking into the texture for data
     * about a given beacon at a given time.
     */
    dt: { type: 'f', value: 0 },
    db: { type: 'f', value: 0 },

    /**
     * These RGBA colors are interpolated between the start and end timestamps
     * based on the timestamp attribute of each vertex.
     */
    startColor: { type: 'v4', value: new THREE.Vector4(0.0, 0.0, 1.0, 1.0) },
    endColor: { type: 'v4', value: new THREE.Vector4(1.0, 0.0, 0.0, 1.0) },

    /**
     * These timestamps indicate the earliest and latest timestamps that we'll
     * draw. The defaults are not necessarily ideal, but they are functional.
     */
    startTimestamp: { type: 'f', value: 0 },
    endTimestamp: { type: 'f', value: +(new Date()) / 1000 },

    /**
     * The startTimeIndex is the number of days between minTimestamp and
     * startTimestamp.
     */
    startTimeIndex: { type: 'f', value: 0 },

    /**
     * The animation clamps contain the timestamps that clamp the visibility of
     * the line to only those vertexes with timestamp values between the clamps.
     * Aniamation is achieved by sliding the clamp values over time.
     */
    startAnimationClamp: { type: 'f', value: -Infinity },
    endAnimationClamp: { type: 'f', value: Infinity }

  };

  this.setValues(parameters);
};
geovelo.LineShaderMaterial.prototype =
  Object.create(THREE.ShaderMaterial.prototype);

/**
 * Set the BeaconVertexTexture.
 *
 * @param {BeaconVertexTexture} texture The texture containing beacon data.
 */
geovelo.LineShaderMaterial.prototype.setBeaconVertexTexture =
    function(texture) {
  this.uniforms.beaconVertexTexture.value = texture;
  this.uniforms.minTimestamp.value = texture.startTimestamp;
  this.uniforms.maxTimestamp.value = texture.endTimestamp;
  this.uniforms.dt.value = 0.5 / texture.width;  // Two timesteps per pixel.
  this.uniforms.db.value = 1.0 / texture.height;
  this.setStartTimestamp(texture.startTimestamp);
  this.setEndTimestamp(texture.endTimestamp);
  this.needsUpdate = true;
}

/**
 * Set the start timestamp.
 */
geovelo.LineShaderMaterial.prototype.setStartTimestamp =
    function(startTimestamp) {
  this.uniforms.startTimestamp.value = startTimestamp;
  this.uniforms.startTimeIndex.value = Math.round(
      (startTimestamp - this.uniforms.minTimestamp.value) / 60 / 60 / 24);
};

/**
 * Set the end timestamp.
 */
geovelo.LineShaderMaterial.prototype.setEndTimestamp =
    function(endTimestamp) {
  this.uniforms.endTimestamp.value = endTimestamp;
};

/**
 * Set the scale.
 */
geovelo.LineShaderMaterial.prototype.setScale = function(scale) {
  this.uniforms.scale.value = scale;
};

/**
 * Set the median correction.
 */
geovelo.LineShaderMaterial.prototype.setMedianCorrection =
    function(medianCorrection) {
  this.uniforms.medianCorrection.value = medianCorrection;
};

/**
 * This GLSL program implements the vertex shader for the line material. Each
 * vertex's color is set to the linear interpolation between the startColor and
 * endColor using the startTimestamp and endTimestamp as the domain and the
 * vertex's timestamp attribute as the value within that domain.
 *
 * The varying value vVisible will be 1 whenever the timestamp is between
 * startTimestamp and endTimestamp, and it's also between the
 * startAnimationClamp and endAnimationClamp. If the vertex's timestamp
 * attribute is outside of either of these ranges, then vVisible will be 0.
 */
geovelo.LineShaderMaterial.VERTEX_SHADER = `

  uniform float scale;
  uniform float medianCorrection;

  uniform sampler2D beaconVertexTexture;

  uniform float minTimestamp;
  uniform float maxTimestamp;

  uniform float dt;
  uniform float db;

  uniform vec4 startColor;
  uniform vec4 endColor;

  uniform float startTimestamp;
  uniform float endTimestamp;
  uniform float startTimeIndex;

  uniform float startAnimationClamp;
  uniform float endAnimationClamp;

  varying vec4 vColor;
  varying float vVisible;

  // Given time and beacon indices, look up the Web Mercator lon/lat coords.
  vec2 lookupPosition(float timeIndex, float beaconIndex) {
    vec4 pack = texture2D(beaconVertexTexture,
        vec2(dt * (timeIndex + 1.5), db * (beaconIndex + 1.5)));
    return mod(timeIndex, 2.0) > 0.5 ? pack.xy : pack.zw;
  }

  void main() {

    // Extract indexes and times from the vertex position.
    float beaconIndex = position.x;

    float beaconStart = position.y;
    float beaconStartIndex = (beaconStart - minTimestamp) / 86400.0;

    float timestamp = position.z;
    float timeIndex = (timestamp - minTimestamp) / 86400.0;

    vColor = mix(startColor, endColor,
        smoothstep(startTimestamp, endTimestamp, timestamp));

    vVisible =
        step(startAnimationClamp, timestamp) *
        step(startTimestamp, timestamp) *
        step(timestamp, endTimestamp) *
        step(timestamp, endAnimationClamp);

    // Beacon's initial position.
    vec2 basePosition = lookupPosition(-1.0, beaconIndex);

    // Current offset position relative to the start time's position.
    vec2 offsetPosition =
        lookupPosition(timeIndex, beaconIndex) -
        lookupPosition(startTimeIndex, beaconIndex);

    // Cumulative median offset position relative to median at start.
    float medianBaseIndex = max(startTimeIndex, beaconStartIndex);
    vec2 medianPosition = medianCorrection *
        (lookupPosition(timeIndex, -1.0) -
         lookupPosition(medianBaseIndex, -1.0));

    float z = smoothstep(minTimestamp, maxTimestamp, timestamp);
    vec4 finalPosition =
        vec4(basePosition + (offsetPosition - medianPosition) * scale, z, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * finalPosition;

  }
`;

/**
 * This GLSL program implements the fragment shader for the line material. It's
 * your basic run-of-the-mill fragment shader with the exception that it'll
 * discard any fragments where vVisible is less than 1. This happens whenever
 * one (or both) of the verticess for this line segment lie outside either the
 * start/end timestamps or animation clamps.
 */
geovelo.LineShaderMaterial.FRAGMENT_SHADER = `

  varying vec4 vColor;
  varying float vVisible;

  void main() {
    if (vVisible < 1.0) {
      discard;
    }
    gl_FragColor = vColor;
  }
`;
