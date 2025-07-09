import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("download/:transferId", "routes/download.tsx")
] satisfies RouteConfig;
