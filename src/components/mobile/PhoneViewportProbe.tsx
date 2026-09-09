"use client";

import { useEffect, useState } from "react";

/**
 * TEMPORARY. A readout of the numbers that decide where the map's bottom edge
 * lands in the installed home-screen app, drawn on the device that has the bug
 * because nothing on a desktop reproduces it.
 *
 * Two blind fixes for the grey band at the bottom of the map both shipped and
 * both missed, which is the signal that the geometry is not what the CSS
 * assumes rather than that the CSS is one value off. This prints the geometry.
 *
 * The three coloured rules are the useful half: each one marks the bottom of a
 * different notion of "the viewport", so a single screenshot says which of them
 * agrees with the physical bottom of the screen and which stops short.
 *
 * Delete this file and its one call site once the band is gone.
 */
export function PhoneViewportProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const read = () => {
      const de = document.documentElement;
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;top:0;left:0;width:0;height:100dvh;visibility:hidden";
      document.body.appendChild(probe);
      const dvh = probe.getBoundingClientRect().height;
      probe.style.height = "100vh";
      const vh = probe.getBoundingClientRect().height;
      probe.remove();

      const cs = getComputedStyle(de);
      const shell = document.querySelector(".pm-phone-shell");
      const shellRect = shell?.getBoundingClientRect();

      setLines([
        `innerHeight   ${window.innerHeight}`,
        `clientHeight  ${de.clientHeight}`,
        `screen.height ${window.screen.height}`,
        `visualVP      ${Math.round(window.visualViewport?.height ?? -1)}`,
        `100dvh        ${Math.round(dvh)}`,
        `100vh         ${Math.round(vh)}`,
        `shell top/h   ${Math.round(shellRect?.top ?? -1)} / ${Math.round(shellRect?.height ?? -1)}`,
        `html h        ${cs.height}`,
        `scrollY       ${Math.round(window.scrollY)}`,
        `inset t/b     ${cs.getPropertyValue("--probe-top").trim()} / ${cs
          .getPropertyValue("--probe-bottom")
          .trim()}`,
        `standalone    ${window.matchMedia("(display-mode: standalone)").matches}`,
        `navStandalone ${(navigator as unknown as { standalone?: boolean }).standalone}`,
        `dpr           ${window.devicePixelRatio}`,
      ]);
    };

    document.documentElement.style.setProperty(
      "--probe-top",
      "env(safe-area-inset-top)",
    );
    document.documentElement.style.setProperty(
      "--probe-bottom",
      "env(safe-area-inset-bottom)",
    );

    read();
    const t = setTimeout(read, 600);
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, []);

  return (
    <>
      {/* bottom of the initial containing block */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 4,
          background: "#ff00d4",
          zIndex: 9999,
          pointerEvents: "none",
        }}
      />
      {/* bottom of 100dvh, measured from the top of the document */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "calc(100dvh - 8px)",
          height: 4,
          background: "#00e5ff",
          zIndex: 9999,
          pointerEvents: "none",
        }}
      />
      {/* bottom of the screen, if the app really owns all of it */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "calc(100dvh + 51px)",
          height: 4,
          background: "#7cff00",
          zIndex: 9999,
          pointerEvents: "none",
        }}
      />
      <pre
        style={{
          position: "fixed",
          left: 8,
          top: "38%",
          margin: 0,
          padding: "8px 10px",
          background: "rgba(0,0,0,0.82)",
          color: "#fff",
          font: "600 12px/1.35 ui-monospace,Menlo,monospace",
          borderRadius: 8,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      >
        {lines.join("\n")}
      </pre>
    </>
  );
}
