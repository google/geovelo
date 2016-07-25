/**
 * @fileoverview Entrypoint for the Geodetic Velocities visualization.
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

/**
 * Entry point for the Geodetic Velocities visualization. The element passed in
 * should be quite large, have a set width and height, and be positioned
 * (having a position of relative or absolute).
 *
 * @param {Element} containerElement The DOM element into which to insert.
 */
geovelo.Visualization = function(containerElement) {

  // DOM element into which to add children.
  this.domElement = document.createElement('div');
  if (containerElement) {
    containerElement.appendChild(this.domElement);
  }

  // Construct and add the Google map.
  var map = this.map = new geovelo.Map(this.domElement);

  // Construct Geodetic Velocities overlay layer.
  var overlay = this.overlay = new geovelo.Overlay(this.domElement);
  overlay.domElement.className = 'overlay';

  // Construct controls.
  var controls = this.controls = new geovelo.Controls(this.domElement);
  controls.domElement.className = 'controls';

  // Construct TimeRange selector.
  var timeRange = this.timeRange = new geovelo.TimeRange(this.domElement);
  timeRange.domElement.style.display = 'none';
  timeRange.domElement.className = 'time-range';

  // Set the default range colors.
  overlay.setStartColor(controls.state.style.startColor);
  overlay.setEndColor(controls.state.style.endColor);
  timeRange.setStartColor(controls.state.style.startColor);
  timeRange.setEndColor(controls.state.style.endColor);

  // Update the Overlay viewport when the map bounds change.
  map.setOverlayElement(overlay.domElement);
  map.onBoundsChanged(overlay.setBounds.bind(overlay));

  // Update settings when time range changes.
  timeRange.domElement.addEventListener('range-changed', function(event) {
    overlay.setStartTimestamp(+event.detail.rangeStart / 1000);
    overlay.setEndTimestamp(+event.detail.rangeEnd / 1000);
  }, false);

  // Listen for settings and data events from the controls.
  controls.domElement.addEventListener('settings-changed', function(event) {
    var setting = event.detail.folderName + '/' + event.detail.optionName;
    var value = event.detail.value;
    switch (setting) {
      case 'data/multiplier':
        overlay.setMultiplier(value);
        break;
      case 'data/medianCorrection':
        overlay.setMedianCorrection(value);
        break;
      case 'data/showMarkers':
        map.setMarkerVisibility(value);
        break;
      case 'style/startColor':
        overlay.setStartColor(value);
        timeRange.setStartColor(value);
        break;
      case 'style/endColor':
        overlay.setEndColor(value);
        timeRange.setEndColor(value);
        break;
      case 'style/lineWidth':
        overlay.setLineWidth(value);
        break;
      case 'animation/enabled':
        value ? overlay.startAnimation() : overlay.stopAnimation();
        break;
      case 'animation/duration':
        overlay.setAnimationDuration(value);
        break;
      case 'animation/delay':
        overlay.setAnimationDelay(value);
        break;
      case 'animation/showStats':
        value ? overlay.showStats() : overlay.hideStats();
        break;
      default:
        throw Error('Unrecogrized setting: ' + setting);
        break;
    }
  }, false);

  // Listen for data-ready events from the controls element, feed to components
  // that need to know.
  controls.domElement.addEventListener('data-ready', function(event) {
    map.setData(event.detail);
    overlay.setData(event.detail);
  }, false);

  // When the Overlay computes a new extent from the incoming data, use that
  // value to set the extent on the TimeRange control.
  overlay.domElement.addEventListener('extent-changed', function(event) {
    timeRange.setExtent(event.detail.extentStart, event.detail.extentEnd);
  }, false);

  // Update controls status and progress meter.
  overlay.domElement.addEventListener('status-update', function(event) {
    controls.status = event.detail.status;
    controls.progress = 100 * event.detail.progress;
  }, false);

};
