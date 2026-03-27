import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layout";
import { EchoesPage } from "../pages/EchoesPage";
import { EchoChatPage } from "../pages/EchoChatPage";
import { ExplorePage } from "../pages/ExplorePage";
import { ExploreVariantPage } from "../pages/ExploreVariantPage";
import { MatchDetailPage } from "../pages/MatchDetailPage";
import { MatchGalleryPage } from "../pages/MatchGalleryPage";
import { ProfilePage } from "../pages/ProfilePage";
import { SplashPage } from "../pages/SplashPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <SplashPage /> },
      { path: "splash", element: <SplashPage /> },
      { path: "explore", element: <ExplorePage /> },
      { path: "explore-archive", element: <ExploreVariantPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "match/:profileId", element: <MatchDetailPage /> },
      { path: "match-gallery/:profileId", element: <MatchGalleryPage /> },
      { path: "echoes", element: <EchoesPage /> },
      { path: "echoes/chat/:chatId", element: <EchoChatPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
