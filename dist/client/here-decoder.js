/* Offline HERE Flexible Polyline v1 decoder and route normalizer. */
(function (global) {
  'use strict';

  const DEFAULT_MAX_POINTS = 20000;
  function assertFinite(value, label) {
    if (!Number.isFinite(value)) throw new Error(label + '_not_finite');
    return value;
  }

  function readUnsigned(bytes, state) {
    let value = 0;
    let shift = 0;
    while (state.index < bytes.length) {
      const digit = bytes[state.index++];
      value += (digit & 0x1f) * 2 ** shift;
      if (!Number.isSafeInteger(value)) throw new Error('flexible_polyline_varint_not_safe_integer');
      if ((digit & 0x20) === 0) return value;
      shift += 5;
      if (shift > 52) throw new Error('flexible_polyline_varint_too_large');
    }
    throw new Error('flexible_polyline_truncated_varint');
  }

  function zigzag(value) {
    if (!Number.isSafeInteger(value)) throw new Error('flexible_polyline_delta_not_safe_integer');
    return value % 2 === 1 ? -(value + 1) / 2 : value / 2;
  }

  function decodeFlexiblePolyline(encoded, maxPoints = DEFAULT_MAX_POINTS) {
    if (typeof encoded !== 'string' || encoded.length === 0) {
      throw new Error('flexible_polyline_must_be_nonempty_string');
    }
    if (!Number.isInteger(maxPoints) || maxPoints < 2 || maxPoints > DEFAULT_MAX_POINTS) {
      throw new Error('invalid_geometry_limit');
    }
    if (encoded.length > maxPoints * 20 + 2) throw new Error('flexible_polyline_encoded_limit_exceeded');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const lookup = new Map(Array.from(alphabet, (character, index) => [character, index]));
    const bytes = [];
    for (const character of encoded) {
      const value = lookup.get(character);
      if (value === undefined) throw new Error('flexible_polyline_invalid_character');
      bytes.push(value);
    }
    const state = { index: 0 };
    const version = readUnsigned(bytes, state);
    if (version !== 1) throw new Error('flexible_polyline_unsupported_version');
    const header = readUnsigned(bytes, state);
    if (header >= 2048) throw new Error('flexible_polyline_reserved_header_bits');
    const precision = header & 0x0f;
    const thirdDimension = (header >> 4) & 0x07;
    const thirdPrecision = (header >> 7) & 0x0f;
    if (thirdDimension === 4 || thirdDimension === 5) throw new Error('flexible_polyline_reserved_third_dimension');
    const factor = 10 ** precision;
    const thirdFactor = 10 ** thirdPrecision;
    let latitude = 0;
    let longitude = 0;
    let third = 0;
    const coordinates = [];
    while (state.index < bytes.length) {
      const latitudeDelta = readUnsigned(bytes, state);
      const longitudeDelta = readUnsigned(bytes, state);
      latitude += zigzag(latitudeDelta);
      longitude += zigzag(longitudeDelta);
      if (!Number.isSafeInteger(latitude) || !Number.isSafeInteger(longitude)) {
        throw new Error('flexible_polyline_coordinate_not_safe_integer');
      }
      if (thirdDimension !== 0) {
        const thirdDelta = readUnsigned(bytes, state);
        third += zigzag(thirdDelta);
        if (!Number.isSafeInteger(third)) throw new Error('flexible_polyline_third_dimension_not_safe_integer');
        assertFinite(third / thirdFactor, 'flexible_polyline_third_dimension');
      }
      if (coordinates.length >= maxPoints) throw new Error('flexible_polyline_geometry_limit_exceeded');
      const point = [latitude / factor, longitude / factor];
      assertFinite(point[0], 'flexible_polyline_latitude');
      assertFinite(point[1], 'flexible_polyline_longitude');
      if (Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) {
        throw new Error('flexible_polyline_coordinate_out_of_range');
      }
      coordinates.push(point);
    }
    if (coordinates.length < 2) throw new Error('flexible_polyline_needs_two_points');
    return coordinates;
  }

  function normalizeNotices(source) {
    if (!Array.isArray(source?.notices)) return [];
    return source.notices.map((notice) => {
      if (typeof notice === 'string') return notice;
      if (!notice || typeof notice !== 'object') return String(notice);
      return [notice.title, notice.code, notice.severity, notice.details, notice.message]
        .filter((part) => typeof part === 'string' && part.length > 0)
        .join(' — ');
    }).filter(Boolean);
  }

  function safeEvidence(section) {
    return {
      id: typeof section.id === 'string' ? section.id : null,
      spans: Array.isArray(section.spans) ? section.spans : [],
      actions: Array.isArray(section.actions) ? section.actions :
        (Array.isArray(section.turnByTurnActions) ? section.turnByTurnActions : []),
      summary: section.summary && typeof section.summary === 'object' ? section.summary : null,
      notices: normalizeNotices(section),
    };
  }

  function normalizedNoticeText(route, evidenceSections) {
    return normalizeNotices(route).concat(evidenceSections.flatMap((section) => section.notices));
  }

  function convertRoutes(response, roundId, maxPoints = DEFAULT_MAX_POINTS) {
    if (!response || !Array.isArray(response.routes)) throw new Error('here_response_routes_missing');
    if (response.routes.length < 1 || response.routes.length > 7) throw new Error('here_response_route_count_out_of_range');
    if (typeof roundId !== 'string' || roundId.length === 0) throw new Error('round_id_required');
    if (!Number.isInteger(maxPoints) || maxPoints < 2 || maxPoints > DEFAULT_MAX_POINTS) {
      throw new Error('invalid_geometry_limit');
    }
    return response.routes.map((route, routeIndex) => {
      if (!route || !Array.isArray(route.sections) || route.sections.length === 0) {
        throw new Error('here_route_sections_missing');
      }
      const geometry = [];
      const sectionOffsets = [];
      const evidenceSections = [];
      let length = 0;
      let duration = 0;
      let allLengthValid = true;
      let allDurationValid = true;
      route.sections.forEach((section, sectionIndex) => {
        const points = decodeFlexiblePolyline(section.polyline, maxPoints);
        const lonLat = points.map(([lat, lon]) => [lon, lat]);
        const first = lonLat[0];
        const duplicate = geometry.length > 0 && geometry[geometry.length - 1][0] === first[0] && geometry[geometry.length - 1][1] === first[1];
        const startOffset = duplicate ? geometry.length - 1 : geometry.length;
        const appended = duplicate ? lonLat.slice(1) : lonLat;
        if (geometry.length + appended.length > maxPoints) throw new Error('here_route_geometry_limit_exceeded');
        geometry.push(...appended);
        sectionOffsets.push({section_index: sectionIndex, start_offset: startOffset, end_offset: geometry.length - 1, skipped_duplicate_start: duplicate});
        evidenceSections.push(safeEvidence(section));
        const summary = section.summary;
        if (summary && Number.isFinite(summary.length) && summary.length >= 0) length += summary.length;
        else allLengthValid = false;
        if (summary && Number.isFinite(summary.duration) && summary.duration >= 0) duration += summary.duration;
        else allDurationValid = false;
      });
      return {
        id: roundId + '-' + (routeIndex + 1),
        route_number: routeIndex + 1,
        name: 'HERE route ' + (routeIndex + 1),
        geometry,
        length_m: allLengthValid ? length : null,
        duration_s: allDurationValid ? duration : null,
        cells: [],
        authority_offsets: null,
        authority_only_cell_count: null,
        exposure: null,
        live_here: true,
        avm_status: 'unevaluated',
        notices: normalizedNoticeText(route, evidenceSections),
        section_offsets: sectionOffsets,
        here_evidence: {sections: evidenceSections},
      };
    });
  }

  const api = {decodeFlexiblePolyline, convertRoutes};
  global.SurviveHere = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
