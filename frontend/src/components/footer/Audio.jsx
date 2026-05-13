import { forwardRef } from 'react'

const Audio = forwardRef(function Audio(
  { trackData, handleDuration, handleCurrentTime, isPlaying, isRemotePlayback = false },
  ref,
) {
  return (
    <audio
      ref={ref}
      onLoadedMetadata={(e) => handleDuration(e.target.duration)}
      onTimeUpdate={(e) => handleCurrentTime(e.target.currentTime)}
      src={isRemotePlayback ? '' : trackData.audioUrl || trackData.track || ''}
      autoPlay={isPlaying}
    />
  )
})

export default Audio
