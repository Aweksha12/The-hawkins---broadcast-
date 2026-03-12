import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import sessionsRouter from "./sessions.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);

export default router;
