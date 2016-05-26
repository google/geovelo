/**
 * @fileoverview Wrapper for constructing Google Maps instance.
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

// Map requires google maps.
if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
  throw Error('Google Maps is required but missing.');
}

var geovelo;
geovelo = geovelo || {};

/**
 * Construct the right kind of Google Map for the Geodetic Velocities
 * visualization.
 *
 * @param {Element} containerElement The DOM element into which to insert.
 */
geovelo.Map = function(containerElement) {

  // DOM Element into which to insert content.
  this.domElement = document.createElement('div');
  var style = this.domElement.style;
  style.position = 'absolute';
  style.top = style.bottom = style.right = style.left = 0;
  if (containerElement) {
    containerElement.appendChild(this.domElement);
  }

  // Callback handlers for when the bounds change.
  this.boundsChangedHandlers = [];

  // Initial coordinates.
  var initial = {
    zoom: 5,
    lon: 139.7667,
    lat: 35.6833
  };

  // Google Map Stylers.
  var mapStyles = [
    {
      "stylers": [
        { "visibility": "off" }
      ]
    },{
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [
        { "visibility": "on" },
        { "saturation": -50 }
      ]
    },{
      "featureType": "landscape.natural",
      "stylers": [
        { "visibility": "on" },
        { "saturation": -100 },
        { "lightness": 100 }
      ]
    },{
      "featureType": "landscape",
      "elementType": "labels",
      "stylers": [
        { "visibility": "off" }
      ]
    }
  ];

  // Create the Google Map
  var map = this.map = new google.maps.Map(this.domElement, {
    zoom: 5,
    center: new google.maps.LatLng(initial.lat, initial.lon),
    mapTypeControl: false,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
    streetViewControl: false,
    styles: mapStyles
  });

  // Google Maps Overlay which is used to compute projection characteristics. We
  // have to use the overlay projection's fromLatLngToContainerPixel() method
  // rather than the map projection's fromLatLngToPoint() method because only
  // the former returns the true screen coordinates relative to the map
  // containing element's bounding rect.
  var overlay = this.overlay = new google.maps.OverlayView();
  overlay.onAdd = this.overlayAddHandler.bind(this);
  overlay.draw = this.overlayDrawHandler.bind(this);
  overlay.setMap(map);

  // The overlay DOM element which we'll later attach.
  this.overlayElement = null;

  // Announce map boundary changes.
  var emit = this.emitBoundsChanged.bind(this);
  //map.addListener('bounds_changed', emit);
  //map.addListener('center_changed', emit);
  map.addListener('zoom_changed', emit);
  map.addListener('idle', emit);
};

/**
 * Add a bounds changed handler.
 * @param {Function} handler Callback handler to invoke with new bounds.
 */
geovelo.Map.prototype.onBoundsChanged = function(handler) {
  this.boundsChangedHandlers.push(handler);
};

/**
 * Produce a custom 'bounds-changed' event to announce that the map bounds
 * have been changed. This happens when the user zooms or pans the map.
 */
geovelo.Map.prototype.emitBoundsChanged = function() {
  var center = this.map.getCenter();
  var lon = geovelo.Map.normalizeLongitude(center.lng());
  var lat = center.lat();

  var bounds = this.map.getBounds();
  var ne = bounds.getNorthEast();
  var sw = bounds.getSouthWest();
  var west = sw.lng();
  var east = ne.lng();

  // Using the west and east longitudinal values from SouthWest and NorthEast
  // are fine when the viewport width only covers part of the Earth, but when
  // sufficiently zoomed out, these values will erroneously report -180 and 180
  // respectively. In that case, we have to compute the true east and west
  // extent of the map.
  var rect = this.domElement.getBoundingClientRect();
  if (this.domElement.parentNode && rect.width) {
    var lonPixelScale = this.getLonPixelScale();
    var lonWidth = rect.width / 2 / lonPixelScale;
    west = lon - lonWidth;
    east = lon + lonWidth;
  }

  var detail = {
    north: ne.lat(),
    south: sw.lat(),
    east: east,
    west: west,

    lon: lon,
    lat: lat,

    zoom: this.map.getZoom(),

    width: rect.width || null,
    height: rect.height || null,

    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom
  };

  // Dispatch event and call change handlers.
  this.domElement.dispatchEvent(
      new CustomEvent('bounds-changed', {bubbles: true, detail: detail}));
  for (var i = 0; i < this.boundsChangedHandlers.length; i++) {
    this.boundsChangedHandlers[i].call(null, detail);
  }

};

/**
 * Given the current map characteristics, compute the longitudinal map scale.
 * That is, how many screen pixels are there to one degree of latitude.
 */
geovelo.Map.prototype.getLonPixelScale = function() {
  var LatLng = google.maps.LatLng;
  var projection = this.overlay.getProjection();
  var westMeridian = new LatLng(0, -90);
  var eastMeridian = new LatLng(0, 90);
  var westMeridianPixel = projection.fromLatLngToContainerPixel(westMeridian);
  var eastMeridianPixel = projection.fromLatLngToContainerPixel(eastMeridian);
  return Math.abs((westMeridianPixel.x - eastMeridianPixel.x) / 180);
};

/**
 * Set the overlay DOM element.
 *
 * @param {HTMLElement} overlayElement The overlay's DOM element.
 */
geovelo.Map.prototype.setOverlayElement = function(overlayElement) {
  this.overlayElement = overlayElement;
};

/**
 * Handler for the overlay's onAdd method.
 */
geovelo.Map.prototype.overlayAddHandler = function() {
  this.overlay.getPanes().overlayLayer.appendChild(this.overlayElement);
};

/**
 * Handler for requests to draw the overlay.
 */
geovelo.Map.prototype.overlayDrawHandler = function() {
  // Placeholder method to satisfy the Google Maps Overlay API.
};

/**
 * Convenience method for normalizing a longitudinal coordinate to be between
 * the bounds of -180 and 180.
 */
geovelo.Map.normalizeLongitude = function(lon) {
  while (lon > 180) {
    lon -= 360;
  }
  while (lon < -180) {
    lon += 360;
  }
  return lon;
};
