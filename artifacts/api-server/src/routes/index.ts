import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generationRouter from "./generation";
import generationLogsRouter from "./generation-logs";
import guardianAlbumRouter from "./guardian-album";
import generationBatchesRouter from "./generation-batches";

const router: IRouter = Router();

router.use(healthRouter);
router.use(guardianAlbumRouter);
router.use(generationBatchesRouter);
router.use(generationLogsRouter);
router.use(generationRouter);

export default router;
