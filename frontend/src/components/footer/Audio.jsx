import { forwardRef } from 'react'

const Audio = forwardRef(function Audio(
  {
    trackData,
    handleDuration,
    handleCurrentTime,
    isPlaying,
    isRemotePlayback = false,
    onEnded,
    onError,
    onSeeked,
  },
  ref,
) {
  return (
    <audio
      ref={ref}
      onEnded={onEnded}
      onError={onError}
      onLoadedMetadata={(e) => handleDuration(e.target.duration)}
      onSeeked={onSeeked}
      onTimeUpdate={(e) => handleCurrentTime(e.target.currentTime)}
      src={isRemotePlayback ? '' : trackData.audioUrl || trackData.track || ''}
      autoPlay={isPlaying}
    />
  )
})

export default Audio
