import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* LazyMotion + m.* components ship only the animation features in use. */}
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <I18nProvider>
          <App />
        </I18nProvider>
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
