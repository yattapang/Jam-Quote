import { Module } from "@nestjs/common";
import { AssembliesController } from "./assemblies.controller.js";
import { AssembliesService } from "./assemblies.service.js";

@Module({
  controllers: [AssembliesController],
  providers: [AssembliesService],
  exports: [AssembliesService],
})
export class AssembliesModule {}
