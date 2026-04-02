import { forwardRef } from 'react'

const Audio = forwardRef(function Audio(
  { trackData, handleDuration, handleCurrentTime, isPlaying },
  ref,
) {
  return (
    <audio
      ref={ref}
      onLoadedMetadata={(e) => handleDuration(e.target.duration)}
      onTimeUpdate={(e) => handleCurrentTime(e.target.currentTime)}
      src={trackData.track}
      autoPlay={isPlaying}
    />
  )
})

export default Audio
