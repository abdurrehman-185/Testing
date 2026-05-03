"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const VEHICLE_ID = "car_01";
const LIVE_ROUTE_LIMIT = 1000;
const LIVE_POLL_INTERVAL_MS = 250;

const RouteMap = dynamic(() => import("../components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center bg-zinc-100 text-sm font-semibold text-zinc-600">
      Loading map...
    </div>
  ),
});

function toDatetimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSpeed(speed) {
  if (!Number.isFinite(speed)) {
    return "N/A";
  }
  return `${(speed * 3.6).toFixed(1)} km/h`;
}

function normalizePoint(point) {
  return {
    ...point,
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    speed: point.speed === null ? null : Number(point.speed),
  };
}

function isUsablePoint(point) {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function mergeRoutePoints(currentPoints, incomingPoints) {
  const pointsById = new Map();
  [...currentPoints, ...incomingPoints].forEach((point) => {
    const normalizedPoint = normalizePoint(point);
    if (normalizedPoint.id && isUsablePoint(normalizedPoint)) {
      pointsById.set(normalizedPoint.id, normalizedPoint);
    }
  });
  return Array.from(pointsById.values())
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-LIVE_ROUTE_LIMIT);
}

function readableSupabaseError(error) {
  if (!error) {
    return "Unknown Supabase error.";
  }
  if (error.message === "Failed to fetch" || error.name === "TypeError") {
    return "Could not reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel Environment Variables.";
  }
  return error.message;
}

export default function DashboardPage() {
  const realtimeChannelRef = useRef(null);
  const livePollIntervalRef = useRef(null);
  const liveClearAfterRef = useRef(null);
  const defaults = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start: toDatetimeLocal(start), end: toDatetimeLocal(end) };
  }, []);

  const [startTime, setStartTime] = useState(defaults.start);
  const [endTime, setEndTime] = useState(defaults.end);
  const [routePoints, setRoutePoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveStatus, setLiveStatus] = useState("History mode");

  const firstPoint = routePoints[0];
  const lastPoint = routePoints[routePoints.length - 1];

  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current && supabase) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
      if (livePollIntervalRef.current) {
        window.clearInterval(livePollIntervalRef.current);
      }
    };
  }, []);

  function stopLivePolling() {
    if (livePollIntervalRef.current) {
      window.clearInterval(livePollIntervalRef.current);
      livePollIntervalRef.current = null;
    }
  }

  function stopLiveTracking(options = {}) {
    if (realtimeChannelRef.current && supabase) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    stopLivePolling();
    setLiveEnabled(false);
    if (!options.keepStatus) {
      setLiveStatus("History mode");
    }
  }

  function clearTracks() {
    liveClearAfterRef.current = liveEnabled ? new Date().toISOString() : null;
    setRoutePoints([]);
    setErrorMessage("");
    setLiveStatus(liveEnabled ? "Tracks cleared - waiting for next GPS point" : "Tracks cleared");
  }

  async function fetchRoute() {
    setErrorMessage("");
    stopLiveTracking({ keepStatus: true });
    setLiveStatus("History mode");

    if (!supabase) {
      setErrorMessage("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setErrorMessage("Choose a valid start and end time.");
      return;
    }
    if (start > end) {
      setErrorMessage("Start time must be before end time.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("location_logs")
      .select("id, vehicle_id, latitude, longitude, speed, timestamp")
      .eq("vehicle_id", VEHICLE_ID)
      .gte("timestamp", start.toISOString())
      .lte("timestamp", end.toISOString())
      .order("timestamp", { ascending: true });
    setLoading(false);

    if (error) {
      setRoutePoints([]);
      setErrorMessage(readableSupabaseError(error));
      return;
    }

    setRoutePoints((data ?? []).map(normalizePoint));
  }

  async function fetchLatestLivePoints() {
    if (!supabase) {
      return;
    }

    let query = supabase
      .from("location_logs")
      .select("id, vehicle_id, latitude, longitude, speed, timestamp")
      .eq("vehicle_id", VEHICLE_ID)
      .order("timestamp", { ascending: false });

    if (liveClearAfterRef.current) {
      query = query.gte("timestamp", liveClearAfterRef.current);
    }

    const { data, error } = await query.limit(10);
    if (error) {
      setLiveStatus("Live polling issue");
      setErrorMessage(readableSupabaseError(error));
      return;
    }

    const latestPoints = (data ?? []).map(normalizePoint).reverse();
    if (latestPoints.length === 0) {
      return;
    }

    const newestPoint = latestPoints[latestPoints.length - 1];
    setRoutePoints((currentPoints) => mergeRoutePoints(currentPoints, latestPoints));
    setLiveStatus(`Live: ${new Date(newestPoint.timestamp).toLocaleTimeString()}`);
  }

  function startLivePolling() {
    stopLivePolling();
    fetchLatestLivePoints();
    livePollIntervalRef.current = window.setInterval(fetchLatestLivePoints, LIVE_POLL_INTERVAL_MS);
  }

  async function startLiveTracking() {
    setErrorMessage("");
    if (!supabase) {
      setErrorMessage("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    stopLiveTracking({ keepStatus: true });
    liveClearAfterRef.current = null;
    setLiveEnabled(true);
    setLiveStatus("Connecting to live tracking...");
    setLoading(true);

    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("location_logs")
      .select("id, vehicle_id, latitude, longitude, speed, timestamp")
      .eq("vehicle_id", VEHICLE_ID)
      .gte("timestamp", since)
      .order("timestamp", { ascending: true })
      .limit(LIVE_ROUTE_LIMIT);
    setLoading(false);

    if (error) {
      setLiveEnabled(false);
      setRoutePoints([]);
      setErrorMessage(readableSupabaseError(error));
      setLiveStatus("Live tracking failed");
      return;
    }

    setRoutePoints((data ?? []).map(normalizePoint));
    startLivePolling();

    const channel = supabase
      .channel(`live-location-${VEHICLE_ID}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "location_logs", filter: `vehicle_id=eq.${VEHICLE_ID}` },
        (payload) => {
          const nextPoint = normalizePoint(payload.new);
          const wasClearedAfter = liveClearAfterRef.current;
          if (!isUsablePoint(nextPoint)) {
            return;
          }
          if (wasClearedAfter && new Date(nextPoint.timestamp) < new Date(wasClearedAfter)) {
            return;
          }
          setRoutePoints((currentPoints) => mergeRoutePoints(currentPoints, [nextPoint]));
          setLiveStatus(`Live: ${new Date(nextPoint.timestamp).toLocaleTimeString()}`);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("Live tracking active");
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setLiveStatus("Live connection problem");
        }
      });

    realtimeChannelRef.current = channel;
  }

  return (
    <main className="min-h-screen bg-stone-100 text-zinc-950">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-normal text-blue-700">Vehicle Telematics</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-950 sm:text-3xl">Fleet Tracking Dashboard</h1>
              <p className="text-sm text-zinc-600">Vehicle ID: {VEHICLE_ID}</p>
            </div>
            <div className="text-sm font-semibold text-zinc-700">
              {liveEnabled ? "Live mode" : "History mode"} - {routePoints.length} GPS points
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[340px_1fr] lg:px-8">
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-zinc-800">Start Time<input className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none ring-blue-600 transition focus:ring-2" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-800">End Time<input className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none ring-blue-600 transition focus:ring-2" type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            <button className="rounded-md bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-zinc-400" disabled={loading} onClick={fetchRoute} type="button">{loading ? "Fetching..." : "Fetch Route"}</button>
            <button className={`rounded-md px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400 ${liveEnabled ? "bg-red-600 hover:bg-red-700" : "bg-emerald-700 hover:bg-emerald-800"}`} disabled={loading} onClick={liveEnabled ? () => stopLiveTracking() : startLiveTracking} type="button">{liveEnabled ? "Stop Live Tracking" : "Start Live Tracking"}</button>
            <button className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-zinc-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-zinc-400" disabled={routePoints.length === 0} onClick={clearTracks} type="button">Clear Tracks</button>
            <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-zinc-700">{liveStatus}</p>
            {errorMessage ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{errorMessage}</p> : null}
          </div>

          <div className="mt-6 grid gap-3 border-t border-stone-200 pt-4 text-sm">
            <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">First point</span><span className="text-right font-semibold text-zinc-900">{firstPoint ? new Date(firstPoint.timestamp).toLocaleString() : "N/A"}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">Last point</span><span className="text-right font-semibold text-zinc-900">{lastPoint ? new Date(lastPoint.timestamp).toLocaleString() : "N/A"}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">Last speed</span><span className="text-right font-semibold text-zinc-900">{lastPoint ? formatSpeed(lastPoint.speed) : "N/A"}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">Live follow</span><span className="text-right font-semibold text-zinc-900">{liveEnabled ? "On" : "Off"}</span></div>
          </div>
        </section>

        <section className="min-h-[520px] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <RouteMap followLatest={liveEnabled} points={routePoints} />
        </section>
      </div>
    </main>
  );
}
