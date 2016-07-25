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

// Map requires Google Maps and d3.
if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
  throw Error('Google Maps is required but missing.');
}
if (typeof d3 === 'undefined') {
  throw Error('d3 is required but missing.');
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

  // Array of Google Maps Markers. Will be created when data arrives.
  this.markers = null;

  // Whether markers should be visible.
  this.markerVisibility = false;

  // Callback handlers for when the bounds change.
  this.boundsChangedHandlers = [];

  // Initial coordinates. Will center on data once loaded.
  var initial = {
    zoom: 2,
    lon: 0,
    lat: 0,
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
    zoom: initial.zoom,
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

  // D3 selection which will be host to the clicked beacon's info.
  this.infoContent = d3.select(document.createElement('div')).html(`
      <h2 class="name"></h2>
      <p>
        Start: <span class="start"></span>
      </p>
      <p>
        Lat, Lon: <span class="lat"></span>, <span class="lon"></span>
      </p>
  `);

  // Info window to show data about a particular marker. Content is bound to
  // the infoContent div.
  this.infoWindow = new google.maps.InfoWindow({
    content: this.infoContent[0][0]
  });
};

/**
 * New beacon data is available. Set up markers and zoom over there.
 *
 * @param {Array} beacons An array of data for the beacons.
 */
geovelo.Map.prototype.setData = function(beacons) {
  // Desired map bounds based on min/max of east/west and south/north.
  var bounds = {
    east: -Infinity,
    west: Infinity,
    north: -90,
    south: 90,
  };

  var markers = [];

  // Create a marker for each beacon.
  for (var i = 0; i < beacons.length; i++) {
    var marker = this.createMarker(beacons[i]);
    markers.push(marker);

    var pos = marker.getPosition();
    var lat = pos.lat();
    var lon = pos.lng();

    bounds.east = Math.max(bounds.east, lon);
    bounds.west = Math.min(bounds.west, lon);
    bounds.north = Math.max(bounds.north, lat);
    bounds.south = Math.min(bounds.south, lat);
  }

  this.map.fitBounds(bounds);

  this.markers = markers;
};

/**
 * Helper function for creating a Google Maps marker from a beacon.
 *
 * @param {Object} beacon Data object representing a beacon.
 */
geovelo.Map.prototype.createMarker = function(beacon) {

  // Keep track of the first, max and min lat and lon values.
  var lat = null;
  var lon = null;
  var minLat = 90;
  var maxLat = -90;
  var minLon = Infinity;
  var maxLon = -Infinity;

  // Roll through the beacon's lat/lon pairs and take note.
  for (var i = 0; i < beacon.lat.length; i++) {
    var currentLat = beacon.lat[i];
    var currentLon = beacon.lon[i];
    if (lat === null && currentLat && currentLon) {
      lat = currentLat;
      lon = currentLon;
    }
    minLat = Math.min(minLat, currentLat);
    minLat = Math.min(minLat, currentLat);
  }

  // If a non-missing lat/lon pair couldn't be found, that's an error.
  if (!lat || !lon) {
    throw Error('Beacon has no non-zero coordinates: ' + beacon.name);
  }

  var marker = new google.maps.Marker({
    position: { lng: lon, lat: lat },
    map: this.map,
    title: beacon.name,
    label: beacon.name,
    visible: this.markerVisibility,
  });

  // Derived values from the beacon.
  var startDate = new Date(beacon.start * 1000);

  // When marker is clicked, update the Info Window content and show it.
  marker.addListener('click', function() {
    // This code makes heavy use of the d3 join/enter/update pattern.
    // JOIN.
    var content = this.infoContent.data([beacon]);

    content.select('.name').text(beacon.name);
    content.select('.start').text(startDate.toDateString());
    content.select('.lat').text(lat.toFixed(3));
    content.select('.lon').text(lon.toFixed(3));

    this.infoWindow.open(this.map, marker);
  }.bind(this));

  return marker;
};

/**
 * Show or hide beacon markers by setting their visibility.
 *
 * @param {boolean} visibility Whether to show (true) or hide (false) markers.
 */
geovelo.Map.prototype.setMarkerVisibility = function(visibility) {
  this.markerVisibility = !!visibility;
  if (!this.markers) {
    return;
  }
  for (var i = 0; i < this.markers.length; i++) {
    this.markers[i].setVisible(this.markerVisibility);
  }
  if (!this.markerVisibility) {
    this.infoWindow.close();
  }
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
