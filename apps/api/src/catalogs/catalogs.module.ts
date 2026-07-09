import { Module } from "@nestjs/common";
import { EquipmentController } from "./equipment.controller.js";
import { EquipmentService } from "./equipment.service.js";
import { LabourRatesController } from "./labour-rates.controller.js";
import { LabourRatesService } from "./labour-rates.service.js";
import { MaterialFavouritesController } from "./material-favourites.controller.js";
import { MaterialFavouritesService } from "./material-favourites.service.js";
import { SuppliersController } from "./suppliers.controller.js";
import { SuppliersService } from "./suppliers.service.js";

/**
 * Catalogs: the labour rate book, material favourites, owned/rented equipment,
 * and the (business-agnostic) supplier directory. Suppliers are global;
 * equipment / labour rates / material favourites are business-scoped.
 */
@Module({
  controllers: [
    EquipmentController,
    LabourRatesController,
    MaterialFavouritesController,
    SuppliersController,
  ],
  providers: [
    EquipmentService,
    LabourRatesService,
    MaterialFavouritesService,
    SuppliersService,
  ],
  exports: [
    EquipmentService,
    LabourRatesService,
    MaterialFavouritesService,
    SuppliersService,
  ],
})
export class CatalogsModule {}
