import { describe, expect, it } from "vitest";
import { acceptedObservationRange, mergeWatchedRanges, watchedSeconds } from "./video-progress";
import { materializeLegacySteps, reconcileVideoProgress } from "./pathway";

describe("Full P2 watched-range evidence", () => {
  it("merges overlap and adjacency deterministically", () => {
    const ranges = mergeWatchedRanges([
      { startSecond: 90, endSecond: 100 },
      { startSecond: 0, endSecond: 10 },
      { startSecond: 9, endSecond: 20 },
      { startSecond: 21, endSecond: 30 },
    ], 100);
    expect(ranges).toEqual([{ startSecond: 0, endSecond: 30 }, { startSecond: 90, endSecond: 100 }]);
    expect(watchedSeconds(ranges)).toBe(40);
    expect(mergeWatchedRanges([...ranges, ...ranges], 100)).toEqual(ranges);
  });

  it("counts only continuous credible playback and rejects seek gaps", () => {
    const base = { sequence: 1, observedMediaSeconds: 10, playbackRate: 1, playerState: "PLAYING" as const, clientObservedAt: "2026-10-26T10:00:00.000Z" };
    expect(acceptedObservationRange({ ...base, fromSecond: 0, toSecond: 10 }, 100, 10)).toEqual({ startSecond: 0, endSecond: 10 });
    expect(acceptedObservationRange({ ...base, fromSecond: 10, toSecond: 90 }, 100, 10)).toBeNull();
    expect(acceptedObservationRange({ ...base, fromSecond: 90, toSecond: 100 }, 100, 10)).toEqual({ startSecond: 90, endSecond: 100 });
  });

  it("does not create coverage while paused or rewinding", () => {
    const base = { sequence: 1, observedMediaSeconds: 10, playbackRate: 1, clientObservedAt: "2026-10-26T10:00:00.000Z" };
    expect(acceptedObservationRange({ ...base, playerState: "PAUSED", fromSecond: 0, toSecond: 10 }, 100, 10)).toBeNull();
    expect(acceptedObservationRange({ ...base, playerState: "PLAYING", fromSecond: 20, toSecond: 10 }, 100, 10)).toBeNull();
  });

  it("materializes one stable step for every mapped video", () => {
    const video = (id: string) => ({ id, title: id, url: `https://youtu.be/${id}`, provider: "YOUTUBE" as const, providerVideoId: id, transcript: "A reviewed transcript long enough", completionThresholdPercent: 90 });
    const steps = materializeLegacySteps({ content: "Reading content", materials: [], questions: [], videos: [video("video-a"), video("video-b")] }, "pack-a");
    expect(steps.filter((step) => step.type === "VIDEO").map((step) => step.id)).toEqual(["video-video-a", "video-video-b"]);
    expect(steps.filter((step) => step.type === "VIDEO").map((step) => (step.config as any).videoId)).toEqual(["video-a", "video-b"]);
  });

  it("ended alone no longer completes legacy video progress", () => {
    const result = reconcileVideoProgress({ title: "Video", url: "https://example.test/video.mp4" }, undefined, { action: "ended", positionSeconds: 20, durationSeconds: 100 }, new Date());
    expect(result.status).toBe("IN_PROGRESS");
    expect(result.progressValue).toBe(20);
  });
});
