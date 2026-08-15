import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generationRouter from "./generation";
import generationLogsRouter from "./generation-logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generationLogsRouter);
router.use(generationRouter);

export default router;
