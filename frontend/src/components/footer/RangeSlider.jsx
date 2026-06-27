import styles from './range-slider.module.css'

function RangeSlider({ value, minvalue, maxvalue, handleChange }) {
  const numericValue = Number(value) || 0
  const numericMax = Number(maxvalue) || 0
  const decimalValue = numericMax > 1 ? numericValue / numericMax : numericValue
  const clampedDecimalValue = Math.min(
    1,
    Math.max(0, Number.isFinite(decimalValue) ? decimalValue : 0),
  )

  const handleInputChange = (e) => {
    handleChange(parseFloat(e.target.value))
  }

  return (
    <div className={styles.progressBar}>
      <input
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
        style={{ left: `calc(${clampedDecimalValue * 100}% - 3px)` }}
      />
    </div>
  )
}

export default RangeSlider
