import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

// Deliberate red check: Frontend build must fail to parse this file.
const intentionalCiBreak = ;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
