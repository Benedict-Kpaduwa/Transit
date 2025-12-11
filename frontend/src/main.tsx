import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import CalgaryMap from "./CalgaryMap.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CalgaryMap />
  </StrictMode>
);
