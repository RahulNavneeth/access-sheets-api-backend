import {
  Controller,
  Get,
  Query,
  Body,
  Post,
  Put,
  BadRequestException,
  NotFoundException,
  ConflictException,
  NotImplementedException,
  HttpException,
} from "@nestjs/common";
import { sheets_v4 } from "googleapis";
import { format } from "../functions/format";
import { format_range } from "../functions/format-range";
import { SheetService } from "./sheet.service";

@Controller("sheet")
export class SheetController {
  constructor(private readonly sheetService: SheetService) {}

  @Get()
  async getSheet(
    @Query()
    query: {
      id: string;
      type: "LIST" | "KEY_VALUE" | "KEY_PAIR";
      limit: number;
      data: { range: [string?, string?, string?] };
    },
    @Body()
    body: {
      sheet: sheets_v4.Sheets;
    }
  ) {
    const { range } = query.data;
    if (query.data.range === undefined || !range.length) {
      throw new BadRequestException("MISSING RANGE");
    }
    try {
      const { data } = await body.sheet.spreadsheets.values.get({
        spreadsheetId: query.id,
        range: format_range(range),
      });
      return format(data.values, query.type, query.limit);
    } catch (e) {
      if (e.code === 400) {
        throw new BadRequestException(
          "ENTER IN THE FOLLOWING FORMAT -> ['{sheetName}' , '{cellFrom}' , '{cellTo}'] (or) ENTER VALID ( RANGE / SHEET NAME )"
        );
      }
      throw new NotFoundException("SPREADSHEET / SHEET NOT FOUND");
    }
  }

  @Post()
  async postData(
    @Body()
    body: {
      sheet: sheets_v4.Sheets;
      data: any[];
      props: {
        bgrgb: [number, number, number, number];
        fgrgb: [number, number, number];
        font: string;
      };
    },
    @Query() query: { id: string; sheetId: number; sheetName: string }
  ) {
    const sheets = body.sheet;
    const [bg_red, bg_green, bg_blue] =
      body.props != undefined && body.props.bgrgb != undefined
        ? body.props.bgrgb
        : [255, 255, 255];
    const [fg_red, fg_green, fg_blue] =
      body.props != undefined && body.props.fgrgb != undefined
        ? body.props.fgrgb
        : [0, 0, 0];

    const font =
      body.props != undefined && body.props.font != undefined
        ? body.props.font
        : "Arial";
    const input =
      typeof body.data === "string" ? JSON.parse(body.data) : body.data;

    if (!query && !query.id) {
      throw new NotImplementedException("SHEET ID NOT MENTIONED");
    }
    try {
      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId: query.id,
        range: query.sheetName,
      });
      if (data.values[0].length === 0) {
        throw new ConflictException("ADD COLUMS TO UPDATE DATA");
      }
      const inputData: any[][] = [];
      let isColumn = false;
      for (let i = 0; i < input.length; i++) {
        inputData.push([]);
        for (let j = 0; j < data.values[0].length; j++) {
          let append = false;
          for (const [key, value] of Object.entries(input[i])) {
            if (key === data.values[0][j]) {
              inputData[i].push(value);
              append = true;
              isColumn = true;
              break;
            }
          }
          if (!append) {
            inputData[i].push("");
          }
        }
      }

      if (!isColumn) {
        throw new ConflictException(
          "ENTER THE CORRECT COLUM NAMES TO UPDATE DATA"
        );
      }
      try {
        const cellData = inputData.map((i) => {
          return {
            values: i.map((value, _index) => {
              return {
                userEnteredValue: { stringValue: value },
                userEnteredFormat: {
                  backgroundColorStyle: {
                    rgbColor: {
                      red: bg_red / 255,
                      green: bg_green / 255,
                      blue: bg_blue / 255,
                    },
                  },
                  verticalAlignment: "MIDDLE",
                  horizontalAlignment: "CENTER",
                  textFormat: {
                    fontFamily: font,
                    foregroundColorStyle: {
                      rgbColor: {
                        red: fg_red / 255,
                        blue: fg_blue / 255,
                        green: fg_green / 255,
                      },
                    },
                  },
                },
              };
            }),
          };
        });
        const { data } = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: query.id,
          requestBody: {
            requests: [
              {
                appendCells: {
                  sheetId: query.sheetId,
                  fields: "*",
                  rows: cellData,
                },
              },
            ],
          },
        });
        return data;
      } catch (e) {
        console.log(e);
        throw new NotFoundException("SPREADSHEET / SHEET NOT FOUND");
      }
    } catch (e) {
      console.log(e);
      throw new NotFoundException("SPREADSHEET / SHEET NOT FOUND");
    }
  }

  @Put()
  async updateCell(
    @Body()
    body: {
      sheet: sheets_v4.Sheets;
      data: {
        range: [string, string, string];
        values: (string | number)[][];
      };
    },
    @Query() query: { id: string }
  ) {
    const sheets = body.sheet;
    const data =
      typeof body.data === "string" ? JSON.parse(body.data) : body.data;
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: query.id,
        range: body.data.range[0],
      });
      if (res.data.values[0].length === 0) {
        throw new ConflictException("ADD COLUMS TO UPDATE DATA");
      }
      const inputData: any[][] = [];
      let isColumn = false;
      for (let i = 0; i < data.values.length; i++) {
        inputData.push([]);
        for (let j = 0; j < res.data.values[0].length; j++) {
          let append = false;
          for (const [key, value] of Object.entries(data.values[i])) {
            if (key === res.data.values[0][j]) {
              inputData[i].push(value);
              append = true;
              isColumn = true;
              break;
            }
          }
        }
      }
      if (!isColumn) {
        throw new ConflictException(
          "ENTER THE CORRECT COLUM NAMES TO UPDATE DATA"
        );
      }
      try {
        const res = await sheets.spreadsheets.values.update({
          spreadsheetId: query.id,
          includeValuesInResponse: true,
          range: format_range(body.data.range),
          valueInputOption: "RAW",
          requestBody: {
            values: inputData,
          },
        });
        return res.data.updatedData;
      } catch (e) {
        const { message, code } = e.response.data.error;
        throw new HttpException(message, code);
      }
    } catch (e) {
      if (e.response.data != undefined && e.response.data.error.code === 404) {
        const error = e.response.data.error;
        throw new HttpException(error.message, error.code);
      }
      throw new HttpException(e.response.message, e.response.statusCode);
    }
  }
}
