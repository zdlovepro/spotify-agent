/**
 * @typedef {Object} MusicProviderSearchParams
 * @property {string} q
 * @property {string} [type]
 * @property {number} [limit]
 * @property {number} [offset]
 * @property {string} [market]
 * @property {string} [include_external]
 */

/**
 * @typedef {Object} MusicProviderRecommendationsParams
 * @property {string} [seed_artists]
 * @property {string} [seed_tracks]
 * @property {string} [seed_genres]
 * @property {number} [limit]
 * @property {string} [market]
 */

/**
 * Provider contract used by AgentMusic catalog and future multi-source integrations.
 *
 * @typedef {Object} MusicProvider
 * @property {(params: MusicProviderSearchParams) => Promise<object>} search
 * @property {(id: string, options?: object) => Promise<object>} getTrack
 * @property {(id: string, options?: object) => Promise<object>} getAlbum
 * @property {(id: string, options?: object) => Promise<object>} getArtist
 * @property {(id: string, options?: object) => Promise<object>} getPlaylist
 * @property {(params: MusicProviderRecommendationsParams) => Promise<object>} getRecommendations
 * @property {(id: string, options?: object) => Promise<object|null>} getPreviewAudio
 */

export class MusicProvider {}

export default MusicProvider
