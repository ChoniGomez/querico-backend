"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categoryController_1 = require("../controllers/categoryController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/', (req, res, next) => {
    if (req.query.all === 'true')
        return (0, auth_1.isAdmin)(req, res, next);
    return next();
}, categoryController_1.getCategories);
router.patch('/:id/visibility', auth_1.isAdmin, categoryController_1.updateCategoryVisibility);
exports.default = router;
