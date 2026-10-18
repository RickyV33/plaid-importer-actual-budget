// The one big figure a page leads with. Counts up once; holds still for
// viewers who ask for reduced motion.

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const DURATION_MS = 900;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 4);

export function HeroNumber(props: { value: number; format: (v: number) => string }) {
  const still = useReducedMotion();
  const [shown, setShown] = useState(still ? props.value : 0);

  useEffect(() => {
    if (still) {
      setShown(props.value);
      return;
    }
    let frame = 0;
    let start: number | undefined;
    const tick = (now: number) => {
      // Time from the first frame: a frame's timestamp can predate this effect.
      start ??= now;
      const x = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      setShown(Math.round(props.value * easeOut(x)));
      if (x < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [props.value, still]);

  return <p className="hero-number">{props.format(shown)}</p>;
}
