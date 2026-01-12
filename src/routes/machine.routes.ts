import { Router } from 'express';
import { machineController, fixedServiceController, materialController } from '../controllers';
import { authenticate, isAdmin, isEmployeeOrAdmin } from '../middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Machine pricing
router.get('/pricing', isEmployeeOrAdmin, machineController.getAllPricing.bind(machineController));
router.put('/pricing/:type', isAdmin, machineController.updatePricing.bind(machineController));
router.get('/my', isEmployeeOrAdmin, machineController.getAuthorizedMachines.bind(machineController));

export default router;
