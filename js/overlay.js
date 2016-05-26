/**
 * @fileoverview Overlay for the Geodetic Velocities visualization.
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

// Overlay requires THREE.js and d3.
if (typeof THREE === 'undefined') {
  throw Error('THREE.js is required to create an Overlay.');
}
if (typeof d3 === 'undefined') {
  throw Error('d3 is required to create an Overlay.');
}

var geovelo;
geovelo = geovelo || {};

/**
 * Construct the overlay for the Geodetic Velocities visualization.
 *
 * @param {Element} containerElement The DOM element into which to insert.
 */
geovelo.Overlay = function(containerElement) {

  // DOM Element into which to insert content.
  this.domElement = document.createElement('div');
  this.domElement.style.pointerEvents = 'none';
  this.domElement.style.position = 'absolute';

  // Hopefully we've been provided a container and we can get a reasonable
  // bounding box. But if not, we'll set up as though we're taking up the whole
  // visible page.
  var width = window.innerWidth;
  var height = window.innerHeight;
  if (containerElement) {
    containerElement.appendChild(this.domElement);
    var rect = containerElement.getBoundingClientRect();
    width = rect.width || width;
    height = rect.height || height;
  }
  this.domElement.style.width = width + 'px';
  this.domElement.style.height = height + 'px';

  // Set up the THREE.js camera looking down the negative z axis from above,
  // with the whole frustum to the right and down. This make coordinate
  // transformations between world coordinates and screen coordinates easy.
  var camera = this.camera =
    new THREE.OrthographicCamera(0, 100, 0, -100, 0, 1000);
  camera.position.set(0, 0, 100);
  camera.updateProjectionMatrix();

  // Set up the THREE.js renderer.
  var renderer = this.renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  style = renderer.domElement.style;
  style.pointerEvents = 'none';
  style.position = 'absolute';
  style.width = style.height = '100%';
  this.domElement.appendChild(renderer.domElement);

  // Set up the scene into which we plan to draw the Geodetic Velocity lines.
  var scene = this.scene = new THREE.Scene();

  // Set up Stats if included in the page.
  if (typeof Stats !== 'undefined') {
    var stats = this.stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = 0;
    stats.domElement.style.left = 0;
    this.domElement.appendChild(stats.domElement);
  }

  // Set up the custom line shader material to use for drawing lines.
  this.material = new geovelo.LineShaderMaterial({
    linewidth: 1
  });

  // Time in ms to allow processing to hold the thread before ceding to the UI.
  this.maxProcessingTime = 100;

  // Time in ms to cede to the UI thread before resuming processing.
  this.resumeProcessingDelay = 10;

  // Time in ms to wait before invoking functions in need of debouncing.
  this.debounceTimeout = 50;
};

/**
 * Render the overlay into the canvas.
 */
geovelo.Overlay.prototype.render = function() {
  this.renderQueued = false;
  this.renderer.render(this.scene, this.camera);
  if (this.stats) {
    this.stats.update();
  }
};

/**
 * Queue up a future call to render.
 */
geovelo.Overlay.prototype.queueRender = function() {
  if (!this.renderQueued) {
    this.renderQueued = true;
    requestAnimationFrame(this.render.bind(this));
  }
};

/**
 * Set the boundaries of the viewable area in terms of minimum and maximum
 * longitude and latitude. If the bounds object includes usable width, height
 * and/or position values (left, right, bottom, top), then these will be used
 * for the renderer well.
 *
 * @param {Object} bounds An object with north, south, east and west properties
 * which map to the latitudinal and longitudinal extent. May also include width
 * and heigt properties for the viewport.
 */
geovelo.Overlay.prototype.setBounds = function(bounds) {
  clearTimeout(this.setBoundsTimer);

  var getX = geovelo.WebMercator.getX;
  var getY = geovelo.WebMercator.getY;

  var minx = getX(bounds.west);
  var maxx = getX(bounds.east);
  var miny = getY(bounds.south);
  var maxy = getY(bounds.north);

  this.camera.right = maxx - minx;
  this.camera.bottom = -(maxy - miny);
  this.camera.position.set(minx, maxy, 100);
  this.camera.updateProjectionMatrix();

  // The overlay element always wants to align with the map's bounding box,
  // irrespective of where its ancestors are positiond to that point.
  var parent = this.domElement.parentNode.getBoundingClientRect();
  this.domElement.style.top = (bounds.top - parent.top) + 'px';
  this.domElement.style.left = (bounds.left - parent.left) + 'px';
  this.domElement.style.bottom = (bounds.bottom - parent.bottom) + 'px';
  this.domElement.style.right = (bounds.right - parent.right) + 'px';

  if (bounds.width && bounds.height) {
    this.renderer.setSize(bounds.width, bounds.height);
  }

  this.render();
};

/**
 * Queue up a future call to setBounds() to debounce frequent updates.
 * @see setBounds().
 */
geovelo.Overlay.prototype.queueSetBounds = function(bounds) {
  clearTimeout(this.setBoundsTimer);
  this.setBoundsTimer =
      setTimeout(this.setBounds.bind(this, bounds), this.debounceTimeout);
};

/**
 * New beacon data is available. Preprocess the data and reconstruct the scene.
 * @param {Array} beacons An array of data for the beacons.
 */
geovelo.Overlay.prototype.setData = function(rawBeacons) {

  /**
   * This object keeps track of how the data processing is going.
   */
  this.processState = {

    // Total number of vertices that we'll have.
    totalVertexCount: 0,

    // Raw beacon data.
    rawBeacons: rawBeacons,

    // Processed beacon data.
    processedBeacons: []

  };

  // Begin processing the data by determining the total vertex count.
  this.analyzeData(true);

};

/**
 * Convenience method for emitting a status update event.
 *
 * @param {string} status Description of what's going on.
 * @param {number} progress Estimate of progress (0-1).
 */
geovelo.Overlay.prototype.emitStatusUpdate = function(status, progress) {
  this.domElement.dispatchEvent(new CustomEvent('status-update', {
        bubbles: true,
        detail: {
          status: status,
          progress: progress
        }
      }));
};

/**
 * Count the total number of vertices that we'll end up with in the final line,
 * and also find out the minimum and maximum timestamps.
 *
 * @param {boolean} init Set to true to initialize state (first call).
 */
geovelo.Overlay.prototype.analyzeData = function(init) {

  var state = this.processState;

  if (init) {
    state.beaconIndex = 0;
    state.startTimestamp = Infinity;
    state.endTimestamp = -Infinity;
  }

  var rawBeacons = state.rawBeacons;

  var start = Date.now();
  while (state.beaconIndex < rawBeacons.length) {
    var beacon = rawBeacons[state.beaconIndex];

    // To save on the number of objects vertices that we have to render, we
    // construct one big geometry rather than thousands of smaller ones. So we
    // cram all of the beacons' lines into one big vertex array, adding in
    // separator vertices to break the line. Line segments that involve these
    // separator vertices are discarded in the shader.
    state.totalVertexCount += beacon.lon.length + 2;

    state.startTimestamp = Math.min(state.startTimestamp, beacon.start);
    state.endTimestamp = Math.max(state.endTimestamp,
        beacon.start + beacon.lon.length * 60 * 60 * 24);

    state.beaconIndex++;

    if (Date.now() - start >= this.maxProcessingTime) {
      // Announce progress, then cede to the UI thread.
      this.emitStatusUpdate('analyzing data...',
          state.beaconIndex / rawBeacons.length);
      return setTimeout(
          this.analyzeData.bind(this), this.resumeProcessingDelay);
    }
  }

  // Announce timestamp extent for controls.
  this.domElement.dispatchEvent(new CustomEvent('extent-changed', {
        bubbles: true,
        detail: {
          extentStart: new Date(state.startTimestamp * 1000),
          extentEnd: new Date(state.endTimestamp * 1000)
        }
      }));

  // Set up the buffers, geometries and lines for further processing.
  this.setupBuffers();
};

/**
 * Since the total vertex count is now known, set up buffers to hold vertex
 * data and begin processing vertex data.
 */
geovelo.Overlay.prototype.setupBuffers = function() {

  var state = this.processState;

  // Create typed array to hold each vertex's relevant attributes:
  //  - x - the beacon index,
  //  - y - the beacon's start timestamp,
  //  - z - the current timestamp.
  // These are used by the LineShaderMaterial's vertex shader to compute
  // final positions based on values retrieved from the BeaconVertexTexture.
  state.positions = new Float32Array(state.totalVertexCount * 3);

  // The beacon vertext texture holds all the data about each beacon at each
  // timestamp that the shader needs.
  // @see geovelo.BeaconVertexTexture.
  var texture = state.texture = new geovelo.BeaconVertexTexture(
      state.rawBeacons.length, state.startTimestamp, state.endTimestamp);
  this.material.setBeaconVertexTexture(texture);

  // Create a geometry and line for the scene. At this point we can safely begin
  // rendereing, even though the actual values haven't been filled in yet.
  var geometry = state.geometry = new THREE.BufferGeometry();
  geometry.addAttribute('position',
      new THREE.BufferAttribute(state.positions, 3));
  var line = state.line = new THREE.Line(geometry, this.material);
  line.frustumCulled = false;
  this.scene.add(line);

  // Begin processing beacon data.
  this.processData(true);
};

/**
 * Perform data processing for a time before ceding back to the UI thread.
 *
 * @param {boolean} init Set to true to initialize processing (first call).
 */
geovelo.Overlay.prototype.processData = function(init) {

  var state = this.processState;

  if (init) {
    state.beaconIndex = 0;
    state.positionIndex = 0;
  }

  var rawBeacons = state.rawBeacons;

  var getX = geovelo.WebMercator.getX;
  var getY = geovelo.WebMercator.getY;

  var start = Date.now();
  while (state.beaconIndex < rawBeacons.length) {

    var beacon = rawBeacons[state.beaconIndex];

    // This object keeps track of the processing of an individual beacon.
    var beaconState = state.beaconState;
    if (!beaconState) {
      beaconState = state.beaconState = {

        // The name of this beacon.
        name: beacon.name,

        // The beacon's base X and Y position in Web Mercator projected coords.
        baseX: getX(beacon.lon[0]),
        baseY: getY(beacon.lat[0]),

        // The index within the beacon's lon/lat arrays to look at next.
        lonLatIndex: 0

      };

      state.texture.setBaseLonLat(
          state.beaconIndex, beaconState.baseX, beaconState.baseY);
    }

    while (beaconState.lonLatIndex < beacon.lon.length) {

      var lon = beacon.lon[beaconState.lonLatIndex];
      var lat = beacon.lat[beaconState.lonLatIndex];

      if (lon && lat) {

        var x = getX(lon) - beaconState.baseX;
        var y = getY(lat) - beaconState.baseY;
        var timestamp = beacon.start + beaconState.lonLatIndex * 60 * 60 * 24;

        // Poke the x and y values into the texture.
        state.texture.setBeaconLonLat(state.beaconIndex, timestamp, x, y);

        if (beaconState.lonLatIndex === 0) {
          // Insert a separator vertex since we're beginning a beacon.
          state.positions[state.positionIndex * 3 + 0] = state.beaconIndex;
          state.positions[state.positionIndex * 3 + 1] = beacon.start;
          state.positions[state.positionIndex * 3 + 2] = -Infinity;
          state.positionIndex++;
        }

        // Insert a vertex for this beacon and timestamp.
        state.positions[state.positionIndex * 3 + 0] = state.beaconIndex;
        state.positions[state.positionIndex * 3 + 1] = beacon.start;
        state.positions[state.positionIndex * 3 + 2] = timestamp;
        state.positionIndex++;

        if (beaconState.lonLatIndex === beacon.lon.length - 1) {
          // Insert a separator vertex since we're at the end of a beacon.
          state.positions[state.positionIndex * 3 + 0] = state.beaconIndex;
          state.positions[state.positionIndex * 3 + 1] = beacon.start;
          state.positions[state.positionIndex * 3 + 2] = Infinity;
          state.positionIndex++;
        }

        state.geometry.attributes.position.needsUpdate = true;

      }

      beaconState.lonLatIndex++;

      if (Date.now() - start >= this.maxProcessingTime) {
        // Announce progress, then cede to the UI thread.
        this.emitStatusUpdate('adding beacon lines...',
            state.beaconIndex / rawBeacons.length);
        return setTimeout(
            this.processData.bind(this), this.resumeProcessingDelay);
      }
    }

    // Finished with this beacon! Save off the beacon state object for further
    // processing.
    state.processedBeacons[state.beaconIndex] = beaconState;

    // Clear out the beaconState object, increment beaconIndex.
    state.beaconState = null;
    state.beaconIndex++;
    state.progress = state.beaconIndex / rawBeacons.length;

    this.material.needsUpdate = true;
    this.queueRender();
  }

  this.beacons = state.processedBeacons;

  // Compute medians for correction.
  this.computeMedians(true);

};

/**
 * Compute and update the cumulative median offset lon/lat values.
 *
 * @param {boolean} init Set to true to initialize processing (first call).
 */
geovelo.Overlay.prototype.computeMedians = function(init) {

  var SECONDS_PER_DAY = 60 * 60 * 24;
  var getX = geovelo.WebMercator.getX;
  var getY = geovelo.WebMercator.getY;

  var state = this.processState;

  if (init) {
    state.currentTimestamp = state.startTimestamp;
    state.medianLons = [];
    state.medianLats = [];
  }

  var start = Date.now();
  while (state.currentTimestamp <= state.endTimestamp) {

    // Lists of all of the longitudinal and latitudinal deltas for all beacons
    // that have data for this timestamp. These will be sorted to pick out the
    // median, and then that will be added to the previous cumulative median to
    // get the new cumulative median.
    var deltaLons = [];
    var deltaLats = [];

    for (var j = 0; j < state.rawBeacons.length; j++) {

      var beacon = state.rawBeacons[j];

      // Skip this beacon if the current timestamp is either before its first
      // reading or after its last.
      if (state.currentTimestamp < beacon.start) {
        continue;
      }
      var endTimestamp = beacon.start + SECONDS_PER_DAY * beacon.lon.length;
      if (state.currentTimestamp > endTimestamp) {
        continue;
      }

      // Look up the lon and lat values for this beacon.
      var index = Math.round(
          (state.currentTimestamp - beacon.start) / SECONDS_PER_DAY);
      var lon = beacon.lon[index];
      var lat = beacon.lat[index];

      if (lon && lat) {
        // Data's not missing, add to arrays.
        var prevLon = state.texture.getLon
        var beaconState = state.processedBeacons[j];

        // Look up the previous lon and lat values, may have to slide backwards
        // over missing data.
        var prevLon = 0;
        var prevLat = 0;
        var prevIndex = index - 1;
        while (prevIndex >= 0 && (!prevLon || !prevLat)) {
          prevLon = beacon.lon[prevIndex];
          prevLat = beacon.lat[prevIndex];
          prevIndex--;
        }

        if (!prevLon || !prevLat) {
          // Couldn't find a previous lon/lat to diff against.
          continue;
        }

        // Add each delta to the appropriate list.
        deltaLons.push(getX(lon) - getX(prevLon));
        deltaLats.push(getY(lat) - getY(prevLat));
      }

    }

    // Add current medians to cumulative medians and set in texture.
    var cumulativeMedianLon =
        (d3.median(deltaLons) || 0.0) +
        (state.medianLons[state.medianLons.length - 1] || 0);
    var cumulativeMedianLat =
        (d3.median(deltaLats) || 0.0) +
        (state.medianLats[state.medianLats.length - 1] || 0);
    state.medianLons.push(cumulativeMedianLon);
    state.medianLats.push(cumulativeMedianLat);
    state.texture.setMedianLonLat(
        state.currentTimestamp, cumulativeMedianLon, cumulativeMedianLat);

    state.currentTimestamp += SECONDS_PER_DAY;

    this.queueRender();

    if (Date.now() - start >= this.maxProcessingTime) {
      // Announce progress, then cede to the UI thread.
      this.emitStatusUpdate('computing medians...',
          (state.currentTimestamp - state.startTimestamp) /
          (state.endTimestamp - state.startTimestamp));
      return setTimeout(
          this.computeMedians.bind(this), this.resumeProcessingDelay);
    }
  }

  this.emitStatusUpdate('ready', 1);

};

/**
 * Set the starting timestamp of the line shader material. This will map to the
 * start color and start opacity.
 *
 * @param {number} startTimestamp Unix timestamp of the start of the range.
 */
geovelo.Overlay.prototype.setStartTimestamp = function(startTimestamp) {
  this.material.setStartTimestamp(startTimestamp);
  this.queueRender();
};

/**
 * Set the ending timestamp of the line shader material. This will map to the
 * end color and start opacity.
 *
 * @param {number} endTimestamp Unix timestamp of the end of the range.
 */
geovelo.Overlay.prototype.setEndTimestamp = function(endTimestamp) {
  this.material.setEndTimestamp(endTimestamp);
  this.queueRender();
};

/**
 * Set the scale on the LineShaderMaterial from the provided multiplier.
 */
geovelo.Overlay.prototype.setMultiplier = function(multiplier) {
  this.material.setScale(Math.pow(10, multiplier));
  this.queueRender();
};

/**
 * Set the amount of median correction to apply.
 */
geovelo.Overlay.prototype.setMedianCorrection = function(medianCorrection) {
  this.material.setMedianCorrection(medianCorrection);
  this.queueRender();
};

/**
 * Set the amount of median correction on the LineShaderMaterial.
 *
 * @param {number} correction Value from 0 (no correction) to 1 (full).
 */
geovelo.Overlay.prototype.setMedianCorrection = function(correction) {
  this.material.setMedianCorrection(correction);
  this.queueRender();
};

/**
 * Given an array of numbers (like latitude or longitude), return how many
 * elements have falsey values.
 */
geovelo.Overlay.countMissing = function(array) {
  var missing = 0;
  for (var i = 0; i < array.length; i++) {
    missing += !array[i];
  }
  return missing;
};
