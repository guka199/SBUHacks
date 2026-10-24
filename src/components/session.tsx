"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import type { AnalysisResult, VideoMetadata } from "@/lib/contracts";

interface Session {
  file: File | null; videoUrl: string | null; metadata: VideoMetadata | null;
  result: AnalysisResult | null;
  selectVideo: (file: File, metadata: VideoMetadata) => void;
  setResult: (result: AnalysisResult | null) => void;
  clearVideo: () => void;
}
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const currentUrl = useRef<string | null>(null);
  useEffect(() => () => { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);
  function clearVideo() {
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = null; setFile(null); setUrl(null); setMetadata(null); setResult(null);
  }
  function selectVideo(next: File, info: VideoMetadata) {
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = URL.createObjectURL(next); setUrl(currentUrl.current); setFile(next); setMetadata(info); setResult(null);
  }
  return <MotionConfig reducedMotion="user"><Context.Provider value={{ file, videoUrl, metadata, result, selectVideo, setResult, clearVideo }}>{children}</Context.Provider></MotionConfig>;
}
export function useSession() { const session = useContext(Context); if (!session) throw new Error("Missing session provider"); return session; }
