import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeControls } from "../components/TimeControls";
import { clampDay, useViewStore } from "../state/store";

function resetStore(totalDays = 10) {
  act(() => {
    useViewStore.getState().reset();
    useViewStore.getState().setTotalDays(totalDays);
  });
}

describe("clampDay", () => {
  it("keeps the day inside the run", () => {
    expect(clampDay(-5, 10)).toBe(0);
    expect(clampDay(99, 10)).toBe(9);
    expect(clampDay(4, 10)).toBe(4);
  });

  it("is zero when there is no run", () => {
    expect(clampDay(7, 0)).toBe(0);
  });
});

describe("playback controls", () => {
  beforeEach(() => resetStore());
  afterEach(() => vi.useRealTimers());

  it("starts paused on day zero", () => {
    render(<TimeControls disabled={false} />);
    expect(screen.getByRole("button", { name: /play playback/i })).toBeInTheDocument();
    expect(useViewStore.getState().day).toBe(0);
  });

  it("steps forward and back", async () => {
    const user = userEvent.setup();
    render(<TimeControls disabled={false} />);
    await user.click(screen.getByRole("button", { name: /next day/i }));
    expect(useViewStore.getState().day).toBe(1);
    await user.click(screen.getByRole("button", { name: /previous day/i }));
    expect(useViewStore.getState().day).toBe(0);
  });

  it("cannot step before the first day", () => {
    render(<TimeControls disabled={false} />);
    expect(screen.getByRole("button", { name: /previous day/i })).toBeDisabled();
  });

  it("advances automatically while playing", () => {
    vi.useFakeTimers();
    render(<TimeControls disabled={false} />);
    act(() => useViewStore.getState().play());
    act(() => {
      vi.advanceTimersByTime(1000); // one second at the default 4x
    });
    expect(useViewStore.getState().day).toBeGreaterThan(0);
  });

  it("stops at the end of the run instead of running past it", () => {
    vi.useFakeTimers();
    render(<TimeControls disabled={false} />);
    act(() => {
      useViewStore.getState().setDay(9);
      useViewStore.getState().play();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const state = useViewStore.getState();
    expect(state.day).toBe(9);
    expect(state.playing).toBe(false);
  });

  it("scrubs with the day slider", () => {
    render(<TimeControls disabled={false} />);
    const slider = screen.getByLabelText(/simulation day/i);
    // A range input is driven by change, not typing.
    fireEvent.change(slider, { target: { value: "6" } });
    expect(useViewStore.getState().day).toBe(6);
    expect(slider).toHaveValue("6");
  });

  it("clamps a slider value past the end of the run", () => {
    render(<TimeControls disabled={false} />);
    fireEvent.change(screen.getByLabelText(/simulation day/i), {
      target: { value: "999" },
    });
    expect(useViewStore.getState().day).toBe(9);
  });

  it("is disabled and paused when there is no run", () => {
    render(<TimeControls disabled />);
    expect(screen.getByRole("button", { name: /play playback/i })).toBeDisabled();
    expect(useViewStore.getState().playing).toBe(false);
  });

  it("resets back to the start", async () => {
    const user = userEvent.setup();
    render(<TimeControls disabled={false} />);
    act(() => useViewStore.getState().setDay(5));
    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(useViewStore.getState().day).toBe(0);
  });
});

describe("mode toggle", () => {
  beforeEach(() => resetStore());

  it("defaults to the Zealo network view", () => {
    expect(useViewStore.getState().mode).toBe("with_zealo");
  });

  it("switches between the two modes", () => {
    act(() => useViewStore.getState().setMode("without_zealo"));
    expect(useViewStore.getState().mode).toBe("without_zealo");
    act(() => useViewStore.getState().setMode("with_zealo"));
    expect(useViewStore.getState().mode).toBe("with_zealo");
  });

  it("keeps the selected day when the mode changes, so the comparison is like for like", () => {
    act(() => {
      useViewStore.getState().setDay(4);
      useViewStore.getState().setMode("without_zealo");
    });
    expect(useViewStore.getState().day).toBe(4);
  });
});
