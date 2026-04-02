import { useNavigate } from 'react-router-dom'
import * as Icons from '../icons/index.jsx'

function PrevPageBtn() {
  const navigate = useNavigate()

  return (
    <button className="PrevBtn" onClick={() => navigate(-1)}>
      <Icons.Prevpage />
    </button>
  )
}

export default PrevPageBtn
