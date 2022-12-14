import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { SheetService } from "./sheet.service";
import { SheetController } from "./sheet.controller";
import { sheetData } from "../sheet.middleware";

@Module({
  controllers: [SheetController],
  providers: [SheetService],
})
export class SheetModule {}
