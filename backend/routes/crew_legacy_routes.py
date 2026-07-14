from fastapi import APIRouter

from crew_legacy.api.admin_api import router as admin_router
from crew_legacy.api.auth import router as auth_router
from crew_legacy.api.dashboard import dashboard_router
from crew_legacy.api.leave_api import router as leave_router
from crew_legacy.api.notification_api import router as notification_router
from crew_legacy.api.profile import router as profile_router
from crew_legacy.api.replacement import router as replacement_router
from crew_legacy.api.roster_api import router as roster_router
from crew_legacy.api.training_assignment import router as training_assignment_router
from crew_legacy.api.training_holiday_api import router as training_holiday_router


router = APIRouter(prefix="/api/crew")
router.include_router(admin_router, prefix="/admin")
router.include_router(auth_router, prefix="/auth")
router.include_router(dashboard_router)
router.include_router(leave_router, prefix="/leave")
router.include_router(notification_router, prefix="/notifications")
router.include_router(profile_router, prefix="/profile")
router.include_router(replacement_router, prefix="/replacement")
router.include_router(roster_router, prefix="/roster")
router.include_router(training_assignment_router, prefix="/training-assign")
router.include_router(training_holiday_router, prefix="/Training_holiday")
