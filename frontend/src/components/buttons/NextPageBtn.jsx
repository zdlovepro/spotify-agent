import { useNavigate } from 'react-router-dom'
import * as Icons from '../icons/index.jsx'

function NextPageBtn() {
  const navigate = useNavigate()

  return (
    <button className="NextBtn" onClick={() => navigate(1)}>
      <Icons.Nextpage />
    </button>
  )
}

export default NextPageBtn
