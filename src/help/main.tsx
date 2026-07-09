import React from "react";
import { createRoot } from "react-dom/client";
import { Help } from "./Help";
import "./help.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Help />
  </React.StrictMode>
);
