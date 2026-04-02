import { useEffect, useRef, useState } from 'react'
import styles from './range-slider.module.css'

function RangeSlider({ value, minvalue, maxvalue, handleChange }) {
  const inputRef = useRef(null)
  const inputRefWidth = useRef(null)
  const [decimalValue, setDecimalValue] = useState(0)

  useEffect(() => {
    const inputWidth = window.getComputedStyle(inputRef.current).width
    inputRefWidth.current = parseInt(inputWidth.replace('px', ''), 10)
  })

  useEffect(() => {
    if (maxvalue > 1) {
      setDecimalValue((value * 1) / maxvalue)
    } else {
      setDecimalValue(value)
    }
  })

  const handleInputChange = (e) => {
    handleChange(parseFloat(e.target.value))
  }

  return (
    <div className={styles.progressBar}>
      <input
        ref={inputRef}
        type="range"
        onChange={handleInputChange}
        className={styles.range__slider}
        min={minvalue}
        max={maxvalue}
        step="0.01"
        value={value}
      />
      <span
        className={styles.spanThumb}
        style={{ left: `${decimalValue * inputRefWidth.current - 3}px` }}
      />
    </div>
  )
}

export default RangeSlider
