import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("download/:transferId", "routes/download.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/register", "routes/auth.register.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
  route("account", "routes/account.tsx")
] satisfies RouteConfig;
