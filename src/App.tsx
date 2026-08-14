import { lazy, Suspense, useEffect, useState } from "react";
import { Rankings } from "./Rankings";

const Manage = lazy(() =>
  import("./Manage").then((module) => ({ default: module.Manage })),
);

function currentScreen() {
  return window.location.hash === "#manage" ? "manage" : "rankings";
}

export default function App() {
  const [screen, setScreen] = useState(currentScreen);

  useEffect(() => {
    const onHashChange = () => setScreen(currentScreen());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return screen === "manage" ? (
    <Suspense fallback={<main className="app-shell" />}>
      <Manage />
    </Suspense>
  ) : (
    <Rankings />
  );
}
