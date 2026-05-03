"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_CENTER = { lat: 31.5204, lng: 74.3587 };
const LIVE_ZOOM = 21;
const HISTORY_ZOOM = 13;
const SCRIPT_ID = "google-maps-js-api";

function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser."));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  const existingScript = document.getElementById(SCRIPT_ID);
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(window.google.maps));
      existingScript.addEventListener("error", () => reject(new Error("Google Maps failed to load.")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });
}

function normalizePoint(point) {
  return {
    ...point,
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    speed: point.speed === null ? null : Number(point.speed),
  };
}

function formatPointTime(point) {
  return point?.timestamp ? new Date(point.timestamp).toLocaleString() : "";
}

export default function RouteMap({ followLatest = false, points }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const [loadError, setLoadError] = useState("");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const validPoints = useMemo(
    () =>
      points
        .map(normalizePoint)
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    [points]
  );

  const path = useMemo(
    () => validPoints.map((point) => ({ lat: point.latitude, lng: point.longitude })),
    [validPoints]
  );
  const startPoint = validPoints[0];
  const endPoint = validPoints[validPoints.length - 1];

  useEffect(() => {
    if (!apiKey) {
      setLoadError("Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to use Google Maps.");
      return;
    }

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapElementRef.current || mapRef.current) {
          return;
        }

        mapRef.current = new maps.Map(mapElementRef.current, {
          center: DEFAULT_CENTER,
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: true,
          streetViewControl: false,
          zoom: HISTORY_ZOOM,
        });

        infoWindowRef.current = new maps.InfoWindow();
      })
      .catch((error) => setLoadError(error.message));

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;

    if (!maps || !map) {
      return;
    }

    polylineRef.current?.setMap(null);
    startMarkerRef.current?.setMap(null);
    endMarkerRef.current?.setMap(null);

    if (path.length > 1) {
      polylineRef.current = new maps.Polyline({
        geodesic: true,
        map,
        path,
        strokeColor: "#2563eb",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
    }

    if (startPoint) {
      const position = { lat: startPoint.latitude, lng: startPoint.longitude };
      startMarkerRef.current = new maps.Marker({ label: "S", map, position, title: "Start" });
      startMarkerRef.current.addListener("click", () => {
        infoWindowRef.current.setContent(`<strong>Start</strong><br />${formatPointTime(startPoint)}`);
        infoWindowRef.current.open({ anchor: startMarkerRef.current, map });
      });
    }

    if (endPoint && endPoint !== startPoint) {
      const position = { lat: endPoint.latitude, lng: endPoint.longitude };
      endMarkerRef.current = new maps.Marker({
        label: followLatest ? "L" : "E",
        map,
        position,
        title: followLatest ? "Latest location" : "End",
      });
      endMarkerRef.current.addListener("click", () => {
        infoWindowRef.current.setContent(
          `<strong>${followLatest ? "Latest location" : "End"}</strong><br />${formatPointTime(endPoint)}`
        );
        infoWindowRef.current.open({ anchor: endMarkerRef.current, map });
      });
    }

    if (path.length === 0) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(HISTORY_ZOOM);
      return;
    }

    if (followLatest) {
      map.setCenter(path[path.length - 1]);
      map.setZoom(Math.max(map.getZoom(), LIVE_ZOOM));
      return;
    }

    if (path.length === 1) {
      map.setCenter(path[0]);
      map.setZoom(15);
      return;
    }

    const bounds = new maps.LatLngBounds();
    path.forEach((position) => bounds.extend(position));
    map.fitBounds(bounds, 48);
  }, [endPoint, followLatest, path, startPoint]);

  if (loadError) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-stone-100 p-6 text-center text-sm font-semibold text-red-700">
        {loadError}
      </div>
    );
  }

  return <div ref={mapElementRef} className="h-full min-h-[520px] w-full" />;
}
