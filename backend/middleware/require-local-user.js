import { optionalLocalUser } from './optional-local-user.js'

export function requireLocalUser(req, res, next) {
  optionalLocalUser(req, res, (error) => {
    if (error) {
      next(error)
      return
    }

    if (req.localUserId) {
      next()
      return
    }

    res.status(401).json({
      error: 'Local user authentication required',
      code: 'local_user_required',
    })
  })
}

export default requireLocalUser
