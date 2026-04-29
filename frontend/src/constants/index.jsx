import * as Icon from '../components/icons/index.jsx'
import React from 'react'

export default {
  MOBILE_SIZE: 640,
}

export const MENU = [
  {
    title: 'Home',
    titleKey: 'nav_home',
    path: '/',
    icon: <Icon.Home />,
    iconSelected: <Icon.HomeActive />,
  },
  {
    title: 'Search',
    titleKey: 'nav_search',
    path: '/search',
    icon: <Icon.Search />,
    iconSelected: <Icon.SearchActive />,
  },
  {
    title: 'Your Library',
    titleKey: 'nav_yourLibrary',
    path: '/library',
    icon: <Icon.Library />,
    iconSelected: <Icon.LibraryActive />,
  },
  {
    title: 'Agent',
    titleKey: 'nav_agent',
    path: '/agent',
    icon: <Icon.Agent />,
    iconSelected: <Icon.AgentActive />,
  },
]

export const PLAYLISTBTN = [
  {
    title: 'Create Playlist',
    titleKey: 'nav_createPlaylist',
    path: '/',
    ImgName: 'createPlaylist',
  },
  {
    title: 'Liked Songs',
    titleKey: 'nav_likedSongs',
    path: '/',
    ImgName: 'popularSong',
  },
]

export const LIBRARYTABS = [
  {
    title: 'Playlists',
    titleKey: 'playlists',
    path: '/library',
  },
  {
    title: 'Podcasts',
    titleKey: 'podcasts',
    path: '/library/podcasts',
  },
  {
    title: 'Artists',
    titleKey: 'artists',
    path: '/library/artists',
  },
  {
    title: 'Albums',
    titleKey: 'albums',
    path: '/library/albums',
  },
]
