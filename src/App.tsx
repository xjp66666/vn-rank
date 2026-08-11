import { useEffect, useState } from "react";
import { Manage } from "./Manage";
import { Rankings } from "./Rankings";

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

  return screen === "manage" ? <Manage /> : <Rankings />;
}
