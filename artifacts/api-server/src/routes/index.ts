import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generationRouter from "./generation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generationRouter);

export default router;
