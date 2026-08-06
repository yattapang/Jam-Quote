/**
 * GENERATED — curated material-attribute catalog with stable ids.
 *
 * This is the in-code mirror of the curated (businessId NULL) rows seeded by
 * migration 20260806120000_material_attribute_schema. Same ids, so a DB that
 * gets the migration applied later shows the identical rows rather than
 * duplicates — same convention as TradesService.MASTER_TRADES.
 *
 * Regenerate only if the curated catalog changes; ids must stay stable.
 */
import { MaterialAttributeKind } from "@prisma/client";

export interface CuratedCategory { id: string; key: string; label: string; sort: number }
export interface CuratedAttribute {
  id: string; categoryId: string; key: string; label: string;
  kind: MaterialAttributeKind; includeInName: boolean; nameOrder: number | null; sort: number;
}
export interface CuratedOption { id: string; attributeId: string; value: string; label: string; sort: number }
export interface CuratedUnit { id: string; key: string; label: string; sort: number }

export const CURATED_CATEGORIES: CuratedCategory[] = [
  {
    "id": "82c49c82-0bc9-487c-a323-2ca4752f9d25",
    "key": "lumber",
    "label": "Lumber",
    "sort": 0
  },
  {
    "id": "ef8a349b-a4ba-40fb-a972-8a25ac85a25d",
    "key": "steel-rebar",
    "label": "Steel / Rebar",
    "sort": 1
  },
  {
    "id": "89ddc7df-9228-44be-9042-046ae4ec78d8",
    "key": "blocks",
    "label": "Blocks",
    "sort": 2
  },
  {
    "id": "ddb28da1-ef04-42c1-a803-3c285a7203fd",
    "key": "cement",
    "label": "Cement",
    "sort": 3
  },
  {
    "id": "9e0f125d-0e35-42f8-979b-b53980aec1b3",
    "key": "aggregate-sand",
    "label": "Aggregate / Sand",
    "sort": 4
  },
  {
    "id": "df093ecf-997a-4a62-900d-040f1f381ea8",
    "key": "roofing",
    "label": "Roofing",
    "sort": 5
  },
  {
    "id": "92b02734-6827-401c-8b72-d52d4cf68765",
    "key": "tiles",
    "label": "Tiles",
    "sort": 6
  },
  {
    "id": "9a8e1291-b734-4c6d-8d3f-ba2abed3823f",
    "key": "plumbing",
    "label": "Plumbing",
    "sort": 7
  },
  {
    "id": "83e33a11-0a70-4b30-ba25-ca74c5192d1a",
    "key": "electrical",
    "label": "Electrical",
    "sort": 8
  },
  {
    "id": "ade150a0-e400-443c-841d-686483c84d9b",
    "key": "paint",
    "label": "Paint",
    "sort": 9
  },
  {
    "id": "51c183db-b252-48cc-ab69-f903c575c94e",
    "key": "doors-windows",
    "label": "Doors & Windows",
    "sort": 10
  },
  {
    "id": "e220add5-ca98-43d6-a78c-47f0f31c490e",
    "key": "fixings",
    "label": "Fixings",
    "sort": 11
  },
  {
    "id": "276bdd6c-5e54-4d60-a7bd-e6d2cac7da23",
    "key": "other",
    "label": "Other",
    "sort": 12
  }
];

export const CURATED_ATTRIBUTES: CuratedAttribute[] = [
  {
    "id": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "categoryId": "82c49c82-0bc9-487c-a323-2ca4752f9d25",
    "key": "dimension",
    "label": "Dimension",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "714633d7-47a1-4891-8909-4a51422e1deb",
    "categoryId": "82c49c82-0bc9-487c-a323-2ca4752f9d25",
    "key": "length",
    "label": "Length",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "categoryId": "82c49c82-0bc9-487c-a323-2ca4752f9d25",
    "key": "species",
    "label": "Species",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "02707915-d53b-49bf-8c1b-9ebc3ee9961d",
    "categoryId": "82c49c82-0bc9-487c-a323-2ca4752f9d25",
    "key": "grade",
    "label": "Grade",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 4,
    "sort": 3
  },
  {
    "id": "b6c4dc41-6df9-403f-87a9-9021907358f3",
    "categoryId": "ef8a349b-a4ba-40fb-a972-8a25ac85a25d",
    "key": "diameter",
    "label": "Diameter",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "821bf229-ff61-485e-8b51-8ca16074ce74",
    "categoryId": "ef8a349b-a4ba-40fb-a972-8a25ac85a25d",
    "key": "length",
    "label": "Length",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "8359e9a7-d133-42d5-aa54-98187f38057c",
    "categoryId": "ef8a349b-a4ba-40fb-a972-8a25ac85a25d",
    "key": "grade",
    "label": "Grade",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "6dda4ec2-78f3-4626-a436-b23f6b30385e",
    "categoryId": "89ddc7df-9228-44be-9042-046ae4ec78d8",
    "key": "size",
    "label": "Size",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e",
    "categoryId": "89ddc7df-9228-44be-9042-046ae4ec78d8",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "5701ed77-1523-4d90-8454-0d7012117163",
    "categoryId": "ddb28da1-ef04-42c1-a803-3c285a7203fd",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "2553c128-733c-4738-b775-efe9c912b90a",
    "categoryId": "ddb28da1-ef04-42c1-a803-3c285a7203fd",
    "key": "bagSize",
    "label": "Bag size",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "categoryId": "9e0f125d-0e35-42f8-979b-b53980aec1b3",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "f9456a2a-07d9-4aff-9b5b-0cda0b808026",
    "categoryId": "9e0f125d-0e35-42f8-979b-b53980aec1b3",
    "key": "grade",
    "label": "Grade",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "9f5d6828-1a16-4c0f-a368-08ec32eac986",
    "categoryId": "df093ecf-997a-4a62-900d-040f1f381ea8",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "4701cbee-81e8-4c0d-a324-3e4b185c9c8f",
    "categoryId": "df093ecf-997a-4a62-900d-040f1f381ea8",
    "key": "profile",
    "label": "Profile",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "cdeef3fd-8153-4143-a9e1-2527107f6048",
    "categoryId": "df093ecf-997a-4a62-900d-040f1f381ea8",
    "key": "gauge",
    "label": "Gauge",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "categoryId": "df093ecf-997a-4a62-900d-040f1f381ea8",
    "key": "length",
    "label": "Length",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 4,
    "sort": 3
  },
  {
    "id": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "categoryId": "92b02734-6827-401c-8b72-d52d4cf68765",
    "key": "size",
    "label": "Size",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "b13a53e5-3360-4546-a66d-34f0f06f4165",
    "categoryId": "92b02734-6827-401c-8b72-d52d4cf68765",
    "key": "material",
    "label": "Material",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "1d0e39c4-84a2-4586-9573-0fca5d4ffcb1",
    "categoryId": "92b02734-6827-401c-8b72-d52d4cf68765",
    "key": "finish",
    "label": "Finish",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "categoryId": "9a8e1291-b734-4c6d-8d3f-ba2abed3823f",
    "key": "diameter",
    "label": "Diameter",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "396a6d6f-4d9b-4f81-a4b8-560dafcc2133",
    "categoryId": "9a8e1291-b734-4c6d-8d3f-ba2abed3823f",
    "key": "material",
    "label": "Material",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "cf4eae7f-c4bc-4314-b05d-fd02062743b7",
    "categoryId": "9a8e1291-b734-4c6d-8d3f-ba2abed3823f",
    "key": "schedule",
    "label": "Schedule",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "categoryId": "83e33a11-0a70-4b30-ba25-ca74c5192d1a",
    "key": "gauge",
    "label": "Gauge",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "e869dcf1-6398-4eec-983c-1576c4567956",
    "categoryId": "83e33a11-0a70-4b30-ba25-ca74c5192d1a",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "d9d66b6e-4e3c-45be-8233-b6179a7ed78d",
    "categoryId": "83e33a11-0a70-4b30-ba25-ca74c5192d1a",
    "key": "conductor",
    "label": "Conductor",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "categoryId": "ade150a0-e400-443c-841d-686483c84d9b",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "244f7fab-70af-4241-a407-c03829f562ba",
    "categoryId": "ade150a0-e400-443c-841d-686483c84d9b",
    "key": "finish",
    "label": "Finish",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "f9bb0679-f192-45db-af0f-8cea98f50330",
    "categoryId": "ade150a0-e400-443c-841d-686483c84d9b",
    "key": "base",
    "label": "Base",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "a0497069-f0d3-454d-96a3-b9e531892cb1",
    "categoryId": "ade150a0-e400-443c-841d-686483c84d9b",
    "key": "size",
    "label": "Size",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 4,
    "sort": 3
  },
  {
    "id": "2386da74-122d-417d-973c-2fb51536a3a6",
    "categoryId": "51c183db-b252-48cc-ab69-f903c575c94e",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "5e4c6361-724c-4b76-9207-3dc59e1e061a",
    "categoryId": "51c183db-b252-48cc-ab69-f903c575c94e",
    "key": "material",
    "label": "Material",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "835beb48-d9d7-4cc6-8c4b-6ae290877fa7",
    "categoryId": "51c183db-b252-48cc-ab69-f903c575c94e",
    "key": "size",
    "label": "Size",
    "kind": MaterialAttributeKind.TEXT,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  },
  {
    "id": "9858d516-5f04-4805-b251-d675943660cb",
    "categoryId": "e220add5-ca98-43d6-a78c-47f0f31c490e",
    "key": "type",
    "label": "Type",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 1,
    "sort": 0
  },
  {
    "id": "6f75df35-3f6d-4865-aa02-c26e1f6c5e3c",
    "categoryId": "e220add5-ca98-43d6-a78c-47f0f31c490e",
    "key": "size",
    "label": "Size",
    "kind": MaterialAttributeKind.TEXT,
    "includeInName": true,
    "nameOrder": 2,
    "sort": 1
  },
  {
    "id": "ef4907d2-90a6-4a86-b26e-4b4a37fa120c",
    "categoryId": "e220add5-ca98-43d6-a78c-47f0f31c490e",
    "key": "finish",
    "label": "Finish",
    "kind": MaterialAttributeKind.ENUM,
    "includeInName": true,
    "nameOrder": 3,
    "sort": 2
  }
];

export const CURATED_OPTIONS: CuratedOption[] = [
  {
    "id": "bd37c49d-be14-489d-b218-8f8d9796f0cc",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "1x2",
    "label": "1x2",
    "sort": 0
  },
  {
    "id": "52bb83bc-9641-4112-83fc-8ca8d3c46fb7",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "1x3",
    "label": "1x3",
    "sort": 1
  },
  {
    "id": "3332aafb-3b20-46ac-be6a-1e23fcc835d0",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "1x4",
    "label": "1x4",
    "sort": 2
  },
  {
    "id": "a6b1bc67-3f10-42a3-a33c-3dc4e3ab6c7a",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "1x6",
    "label": "1x6",
    "sort": 3
  },
  {
    "id": "36c45982-73fe-4c1a-bc1c-da70f2fafc70",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "1x8",
    "label": "1x8",
    "sort": 4
  },
  {
    "id": "2939987e-b40c-446d-9ac8-061b06053bec",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "2x2",
    "label": "2x2",
    "sort": 5
  },
  {
    "id": "534209cf-6704-465e-93c4-058a83b3e325",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "2x3",
    "label": "2x3",
    "sort": 6
  },
  {
    "id": "582dc8e9-6951-4358-a49d-066e6af09818",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "2x4",
    "label": "2x4",
    "sort": 7
  },
  {
    "id": "9bcc5cee-1cd9-462e-a4a6-70993f1cc0b5",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "2x6",
    "label": "2x6",
    "sort": 8
  },
  {
    "id": "5b0ef616-c879-4e0b-a11e-6862633b63ba",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "2x8",
    "label": "2x8",
    "sort": 9
  },
  {
    "id": "6a0060a8-5d53-47b9-b605-edd8ebf779d4",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "2x10",
    "label": "2x10",
    "sort": 10
  },
  {
    "id": "e1687116-9479-4a97-b7cf-3d9dbe71ac64",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "2x12",
    "label": "2x12",
    "sort": 11
  },
  {
    "id": "d0d858f1-8c43-480c-ba50-d6ed5f7da2af",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "4x4",
    "label": "4x4",
    "sort": 12
  },
  {
    "id": "dcd699ee-31b0-485a-bb76-ba488b48831b",
    "attributeId": "0851fc31-68e1-49c0-846c-d23881b8b00e",
    "value": "6x6",
    "label": "6x6",
    "sort": 13
  },
  {
    "id": "d229b352-e95a-4ae5-90e8-50a2a80d3400",
    "attributeId": "714633d7-47a1-4891-8909-4a51422e1deb",
    "value": "8ft",
    "label": "8ft",
    "sort": 0
  },
  {
    "id": "90ba2893-7ee5-4e70-82d5-611ae8a461dc",
    "attributeId": "714633d7-47a1-4891-8909-4a51422e1deb",
    "value": "10ft",
    "label": "10ft",
    "sort": 1
  },
  {
    "id": "30507110-3536-4336-9102-82b94e25ae77",
    "attributeId": "714633d7-47a1-4891-8909-4a51422e1deb",
    "value": "12ft",
    "label": "12ft",
    "sort": 2
  },
  {
    "id": "a672e6f1-e6e1-4e98-a9d8-9cc3be15574d",
    "attributeId": "714633d7-47a1-4891-8909-4a51422e1deb",
    "value": "14ft",
    "label": "14ft",
    "sort": 3
  },
  {
    "id": "22b96888-8d5e-401b-a45c-2b086fbf8e2c",
    "attributeId": "714633d7-47a1-4891-8909-4a51422e1deb",
    "value": "16ft",
    "label": "16ft",
    "sort": 4
  },
  {
    "id": "552d3c99-102b-4a84-9f9c-c6d8a1e5443d",
    "attributeId": "714633d7-47a1-4891-8909-4a51422e1deb",
    "value": "18ft",
    "label": "18ft",
    "sort": 5
  },
  {
    "id": "ad4e857b-e997-41a8-9a4c-1259e5aa2b69",
    "attributeId": "714633d7-47a1-4891-8909-4a51422e1deb",
    "value": "20ft",
    "label": "20ft",
    "sort": 6
  },
  {
    "id": "827c2f07-8a64-429c-90a3-dc0b5552e5f2",
    "attributeId": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "value": "pine",
    "label": "Pine",
    "sort": 0
  },
  {
    "id": "3a9d36b8-e2f4-4061-b10d-c538267aca4f",
    "attributeId": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "value": "treated pine",
    "label": "Treated Pine",
    "sort": 1
  },
  {
    "id": "87234754-9b11-47bf-87a6-08298d0cc805",
    "attributeId": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "value": "cedar",
    "label": "Cedar",
    "sort": 2
  },
  {
    "id": "a5d2b6bb-54e8-4e8a-b0a6-4fd281827ebe",
    "attributeId": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "value": "mahogany",
    "label": "Mahogany",
    "sort": 3
  },
  {
    "id": "62e6930c-4bab-4f42-9509-a4d590efcd4c",
    "attributeId": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "value": "blue mahoe",
    "label": "Blue Mahoe",
    "sort": 4
  },
  {
    "id": "4d5b11a5-6f9c-4ef0-971a-99f81155d4a5",
    "attributeId": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "value": "greenheart",
    "label": "Greenheart",
    "sort": 5
  },
  {
    "id": "b3c4b4c8-e85c-41ec-8c92-901ef7638a26",
    "attributeId": "e27f74c3-5ca6-4b90-a09e-21523c03f46c",
    "value": "teak",
    "label": "Teak",
    "sort": 6
  },
  {
    "id": "39cf984d-2bc1-4b03-acd9-def2f54fb1a2",
    "attributeId": "02707915-d53b-49bf-8c1b-9ebc3ee9961d",
    "value": "select",
    "label": "Select",
    "sort": 0
  },
  {
    "id": "ebe0fd8e-efc3-4186-87bd-458d482e020a",
    "attributeId": "02707915-d53b-49bf-8c1b-9ebc3ee9961d",
    "value": "no.1",
    "label": "No.1",
    "sort": 1
  },
  {
    "id": "fb544946-2d3a-434a-956d-37141be27529",
    "attributeId": "02707915-d53b-49bf-8c1b-9ebc3ee9961d",
    "value": "no.2",
    "label": "No.2",
    "sort": 2
  },
  {
    "id": "5362e312-74fa-4e3f-bfef-32f25607e315",
    "attributeId": "02707915-d53b-49bf-8c1b-9ebc3ee9961d",
    "value": "construction",
    "label": "Construction",
    "sort": 3
  },
  {
    "id": "bce71b79-a872-4045-afc4-f52f46232d34",
    "attributeId": "02707915-d53b-49bf-8c1b-9ebc3ee9961d",
    "value": "utility",
    "label": "Utility",
    "sort": 4
  },
  {
    "id": "97324264-6ffa-47dd-a6a5-cbcd780d28d2",
    "attributeId": "02707915-d53b-49bf-8c1b-9ebc3ee9961d",
    "value": "rough",
    "label": "Rough",
    "sort": 5
  },
  {
    "id": "6ca6e823-5546-4dd5-b9b8-ea094c0a05aa",
    "attributeId": "b6c4dc41-6df9-403f-87a9-9021907358f3",
    "value": "1/4in",
    "label": "1/4in",
    "sort": 0
  },
  {
    "id": "8b23a575-2181-4c38-8bf3-45243d27f3dc",
    "attributeId": "b6c4dc41-6df9-403f-87a9-9021907358f3",
    "value": "3/8in",
    "label": "3/8in",
    "sort": 1
  },
  {
    "id": "2172d1d6-8c7f-42db-9baa-0519ef26c8a3",
    "attributeId": "b6c4dc41-6df9-403f-87a9-9021907358f3",
    "value": "1/2in",
    "label": "1/2in",
    "sort": 2
  },
  {
    "id": "9e17c109-3499-4b89-a4d7-5c0d95e2bb1c",
    "attributeId": "b6c4dc41-6df9-403f-87a9-9021907358f3",
    "value": "5/8in",
    "label": "5/8in",
    "sort": 3
  },
  {
    "id": "647152a3-b880-4e69-8a3e-c655f6a108cc",
    "attributeId": "b6c4dc41-6df9-403f-87a9-9021907358f3",
    "value": "3/4in",
    "label": "3/4in",
    "sort": 4
  },
  {
    "id": "accfc2a7-652d-44e1-95a5-63f6760d44d9",
    "attributeId": "b6c4dc41-6df9-403f-87a9-9021907358f3",
    "value": "1in",
    "label": "1in",
    "sort": 5
  },
  {
    "id": "ffadd4a2-d7bd-4d07-b8e5-daa2c3e43347",
    "attributeId": "821bf229-ff61-485e-8b51-8ca16074ce74",
    "value": "20ft",
    "label": "20ft",
    "sort": 0
  },
  {
    "id": "6f9513a5-5cd1-426d-9bdf-412210dea4f0",
    "attributeId": "821bf229-ff61-485e-8b51-8ca16074ce74",
    "value": "30ft",
    "label": "30ft",
    "sort": 1
  },
  {
    "id": "5c56509f-6445-482d-8b9a-9d21fbfe9045",
    "attributeId": "821bf229-ff61-485e-8b51-8ca16074ce74",
    "value": "40ft",
    "label": "40ft",
    "sort": 2
  },
  {
    "id": "97823833-e3ea-4cce-823f-a19aba8c8e45",
    "attributeId": "8359e9a7-d133-42d5-aa54-98187f38057c",
    "value": "grade 40",
    "label": "Grade 40",
    "sort": 0
  },
  {
    "id": "2e3cdec2-8678-49aa-860d-12c4c3c8ed25",
    "attributeId": "8359e9a7-d133-42d5-aa54-98187f38057c",
    "value": "grade 60",
    "label": "Grade 60",
    "sort": 1
  },
  {
    "id": "c58587f4-c940-49a4-9992-d1da31830d1d",
    "attributeId": "6dda4ec2-78f3-4626-a436-b23f6b30385e",
    "value": "4in",
    "label": "4in",
    "sort": 0
  },
  {
    "id": "288dc756-09f5-46e6-8127-c44aca4ed06c",
    "attributeId": "6dda4ec2-78f3-4626-a436-b23f6b30385e",
    "value": "6in",
    "label": "6in",
    "sort": 1
  },
  {
    "id": "6924ce9f-3802-4ab4-a90e-9e020d460e49",
    "attributeId": "6dda4ec2-78f3-4626-a436-b23f6b30385e",
    "value": "8in",
    "label": "8in",
    "sort": 2
  },
  {
    "id": "e2f89706-82af-48ca-9098-436f28faef8f",
    "attributeId": "6dda4ec2-78f3-4626-a436-b23f6b30385e",
    "value": "10in",
    "label": "10in",
    "sort": 3
  },
  {
    "id": "ecf702d3-c5c3-4c50-bce3-1df7389df170",
    "attributeId": "6dda4ec2-78f3-4626-a436-b23f6b30385e",
    "value": "12in",
    "label": "12in",
    "sort": 4
  },
  {
    "id": "acb0d85b-f069-4e8d-b4f1-97bcf0d6761e",
    "attributeId": "83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e",
    "value": "hollow",
    "label": "Hollow",
    "sort": 0
  },
  {
    "id": "ef177715-f8d0-458a-bac8-dfc055483ce2",
    "attributeId": "83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e",
    "value": "solid",
    "label": "Solid",
    "sort": 1
  },
  {
    "id": "e3bec6d3-db80-4387-a0ee-d5414b234859",
    "attributeId": "83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e",
    "value": "decorative",
    "label": "Decorative",
    "sort": 2
  },
  {
    "id": "dc1392d9-18f5-4733-ae4f-40bdeba4d603",
    "attributeId": "83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e",
    "value": "partition",
    "label": "Partition",
    "sort": 3
  },
  {
    "id": "6cba70ed-6af0-4888-944e-2c11b24f899a",
    "attributeId": "5701ed77-1523-4d90-8454-0d7012117163",
    "value": "portland type i",
    "label": "Portland Type I",
    "sort": 0
  },
  {
    "id": "88abab43-267f-4f03-ba20-cf3e8b478d55",
    "attributeId": "5701ed77-1523-4d90-8454-0d7012117163",
    "value": "portland type ii",
    "label": "Portland Type II",
    "sort": 1
  },
  {
    "id": "63545649-c0cc-4579-a595-e61362b67e78",
    "attributeId": "5701ed77-1523-4d90-8454-0d7012117163",
    "value": "white",
    "label": "White",
    "sort": 2
  },
  {
    "id": "6c38bebe-21c9-4e14-b84e-235710ed88c8",
    "attributeId": "5701ed77-1523-4d90-8454-0d7012117163",
    "value": "masonry",
    "label": "Masonry",
    "sort": 3
  },
  {
    "id": "0004ccc1-6431-46b4-89ac-f83c573106f6",
    "attributeId": "5701ed77-1523-4d90-8454-0d7012117163",
    "value": "rapid set",
    "label": "Rapid Set",
    "sort": 4
  },
  {
    "id": "79b2d07a-d42d-4938-9bfe-5d4b2f25aeba",
    "attributeId": "2553c128-733c-4738-b775-efe9c912b90a",
    "value": "25kg",
    "label": "25kg",
    "sort": 0
  },
  {
    "id": "50b9293d-cfe7-41c9-a236-a5834fe62e8a",
    "attributeId": "2553c128-733c-4738-b775-efe9c912b90a",
    "value": "42.5kg",
    "label": "42.5kg",
    "sort": 1
  },
  {
    "id": "33e5762f-58df-4d45-a686-ddd0def8b2a6",
    "attributeId": "2553c128-733c-4738-b775-efe9c912b90a",
    "value": "50kg",
    "label": "50kg",
    "sort": 2
  },
  {
    "id": "dd67cde0-eae1-4990-9590-f28e9ea4f77c",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "sharp sand",
    "label": "Sharp Sand",
    "sort": 0
  },
  {
    "id": "253185ca-f08f-4ebc-abf0-1bd8fbf4da66",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "building sand",
    "label": "Building Sand",
    "sort": 1
  },
  {
    "id": "326117d2-26c4-4999-9c52-37f5ebb31616",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "fill sand",
    "label": "Fill Sand",
    "sort": 2
  },
  {
    "id": "94da841f-7166-4084-9c82-8d3f89583ff5",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "crusher run",
    "label": "Crusher Run",
    "sort": 3
  },
  {
    "id": "44511ce4-29d3-4dda-8f7e-2a4873ad6d5a",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "3/4 stone",
    "label": "3/4 Stone",
    "sort": 4
  },
  {
    "id": "ffce8104-a4c9-4476-8215-ea56f97eb5c1",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "1/2 stone",
    "label": "1/2 Stone",
    "sort": 5
  },
  {
    "id": "f717ae37-94cc-4a08-8a5f-c3f2a912b1c2",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "marl",
    "label": "Marl",
    "sort": 6
  },
  {
    "id": "9ae7b7d3-9b2f-40ed-80fd-d44be912ebce",
    "attributeId": "e54f21fa-5736-4075-844a-3ef2fd821033",
    "value": "gravel",
    "label": "Gravel",
    "sort": 7
  },
  {
    "id": "f3a2cb46-3d15-4ad3-9750-89cb272a9b3a",
    "attributeId": "f9456a2a-07d9-4aff-9b5b-0cda0b808026",
    "value": "washed",
    "label": "Washed",
    "sort": 0
  },
  {
    "id": "2d6be186-c4dd-4baf-a873-9edf93a39aed",
    "attributeId": "f9456a2a-07d9-4aff-9b5b-0cda0b808026",
    "value": "unwashed",
    "label": "Unwashed",
    "sort": 1
  },
  {
    "id": "623964a0-4704-4cdc-b3dd-519997f3c860",
    "attributeId": "9f5d6828-1a16-4c0f-a368-08ec32eac986",
    "value": "zinc",
    "label": "Zinc",
    "sort": 0
  },
  {
    "id": "96b8ed20-d35d-4a46-bacd-8323fbd6a817",
    "attributeId": "9f5d6828-1a16-4c0f-a368-08ec32eac986",
    "value": "aluminium",
    "label": "Aluminium",
    "sort": 1
  },
  {
    "id": "a2941221-2e6f-4e17-9e16-4918dee641ee",
    "attributeId": "9f5d6828-1a16-4c0f-a368-08ec32eac986",
    "value": "decking",
    "label": "Decking",
    "sort": 2
  },
  {
    "id": "1500df31-34bf-4a9c-8a63-020361782c60",
    "attributeId": "9f5d6828-1a16-4c0f-a368-08ec32eac986",
    "value": "shingle",
    "label": "Shingle",
    "sort": 3
  },
  {
    "id": "aa890223-7f2b-4a24-b7a2-27d85d742e03",
    "attributeId": "9f5d6828-1a16-4c0f-a368-08ec32eac986",
    "value": "clay tile",
    "label": "Clay Tile",
    "sort": 4
  },
  {
    "id": "c4754256-7b65-4425-a469-8b43efc2cc4d",
    "attributeId": "9f5d6828-1a16-4c0f-a368-08ec32eac986",
    "value": "concrete tile",
    "label": "Concrete Tile",
    "sort": 5
  },
  {
    "id": "42859fa8-04bd-4003-aac6-9b1249419f9d",
    "attributeId": "4701cbee-81e8-4c0d-a324-3e4b185c9c8f",
    "value": "corrugated",
    "label": "Corrugated",
    "sort": 0
  },
  {
    "id": "4edfc117-abfb-41a8-810c-f262f2814a5d",
    "attributeId": "4701cbee-81e8-4c0d-a324-3e4b185c9c8f",
    "value": "trapezoidal",
    "label": "Trapezoidal",
    "sort": 1
  },
  {
    "id": "909e11ab-16e6-4cb9-92e7-7f6a47f409a0",
    "attributeId": "4701cbee-81e8-4c0d-a324-3e4b185c9c8f",
    "value": "standing seam",
    "label": "Standing Seam",
    "sort": 2
  },
  {
    "id": "35ed0463-db34-4438-8858-ed98724cebbf",
    "attributeId": "4701cbee-81e8-4c0d-a324-3e4b185c9c8f",
    "value": "flat",
    "label": "Flat",
    "sort": 3
  },
  {
    "id": "8b482fe8-3d28-4b81-9c87-41b594f79016",
    "attributeId": "cdeef3fd-8153-4143-a9e1-2527107f6048",
    "value": "26",
    "label": "26",
    "sort": 0
  },
  {
    "id": "24977a36-833b-4bb2-bbbf-097a8096c708",
    "attributeId": "cdeef3fd-8153-4143-a9e1-2527107f6048",
    "value": "28",
    "label": "28",
    "sort": 1
  },
  {
    "id": "f72faf63-5f1b-462b-8269-cac5731f53d6",
    "attributeId": "cdeef3fd-8153-4143-a9e1-2527107f6048",
    "value": "30",
    "label": "30",
    "sort": 2
  },
  {
    "id": "fa38d6fc-68c0-4bfd-a319-1bac39ebb3b3",
    "attributeId": "cdeef3fd-8153-4143-a9e1-2527107f6048",
    "value": "32",
    "label": "32",
    "sort": 3
  },
  {
    "id": "a90b745c-5470-46c8-bf36-7e920cad6674",
    "attributeId": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "value": "8ft",
    "label": "8ft",
    "sort": 0
  },
  {
    "id": "05b04cfc-2a97-485d-893b-3d0de0dcdcb7",
    "attributeId": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "value": "10ft",
    "label": "10ft",
    "sort": 1
  },
  {
    "id": "afe491a5-bd26-429b-846e-4a5ff69ad532",
    "attributeId": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "value": "12ft",
    "label": "12ft",
    "sort": 2
  },
  {
    "id": "0fd9e40e-3e9a-491b-b6be-76849812ca8a",
    "attributeId": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "value": "14ft",
    "label": "14ft",
    "sort": 3
  },
  {
    "id": "4e5a884b-9f89-4ab9-b1ef-5d20b2a73b81",
    "attributeId": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "value": "16ft",
    "label": "16ft",
    "sort": 4
  },
  {
    "id": "1a1d2e6c-48ae-4af6-9d5d-c49a9ab227e8",
    "attributeId": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "value": "18ft",
    "label": "18ft",
    "sort": 5
  },
  {
    "id": "26f1de4c-82f8-49e4-afab-a8b1037306d8",
    "attributeId": "17f859ed-0c55-4277-a724-423f3638a7a2",
    "value": "20ft",
    "label": "20ft",
    "sort": 6
  },
  {
    "id": "82861c42-b937-4461-b331-ae2a852294fd",
    "attributeId": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "value": "12x12",
    "label": "12x12",
    "sort": 0
  },
  {
    "id": "f3a34db2-32bc-44b0-a257-8eadee63e4b0",
    "attributeId": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "value": "12x24",
    "label": "12x24",
    "sort": 1
  },
  {
    "id": "95f532fd-0269-4366-a460-e29f3d5d6cb4",
    "attributeId": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "value": "16x16",
    "label": "16x16",
    "sort": 2
  },
  {
    "id": "ad59b5e2-c1e2-43d5-b551-7f6efc62c8ea",
    "attributeId": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "value": "18x18",
    "label": "18x18",
    "sort": 3
  },
  {
    "id": "496cde34-7c51-48e4-bb9c-3dba9439d05e",
    "attributeId": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "value": "24x24",
    "label": "24x24",
    "sort": 4
  },
  {
    "id": "78676c51-acc5-41d0-a7b1-a196ca256aef",
    "attributeId": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "value": "300x600",
    "label": "300x600",
    "sort": 5
  },
  {
    "id": "0f4c8657-b966-4aed-a03d-089cc2e7b999",
    "attributeId": "9a381a2f-9c07-4f08-87a5-fde5afe2a73a",
    "value": "600x600",
    "label": "600x600",
    "sort": 6
  },
  {
    "id": "c99a2c70-4f18-4290-8bd0-56da5b435f6c",
    "attributeId": "b13a53e5-3360-4546-a66d-34f0f06f4165",
    "value": "ceramic",
    "label": "Ceramic",
    "sort": 0
  },
  {
    "id": "37e687a5-4925-4a0d-b71c-a05591f4bc5f",
    "attributeId": "b13a53e5-3360-4546-a66d-34f0f06f4165",
    "value": "porcelain",
    "label": "Porcelain",
    "sort": 1
  },
  {
    "id": "345888ff-7194-4fa6-8cd5-ff62eb282c37",
    "attributeId": "b13a53e5-3360-4546-a66d-34f0f06f4165",
    "value": "marble",
    "label": "Marble",
    "sort": 2
  },
  {
    "id": "b7d867b1-771e-481c-9bdb-4c017dc323d5",
    "attributeId": "b13a53e5-3360-4546-a66d-34f0f06f4165",
    "value": "granite",
    "label": "Granite",
    "sort": 3
  },
  {
    "id": "a7895b3a-886f-4ee5-bd0c-7161e1cbbdc4",
    "attributeId": "b13a53e5-3360-4546-a66d-34f0f06f4165",
    "value": "vinyl",
    "label": "Vinyl",
    "sort": 4
  },
  {
    "id": "96e6356d-8e38-4aae-8a06-56b8e8a44be0",
    "attributeId": "b13a53e5-3360-4546-a66d-34f0f06f4165",
    "value": "terrazzo",
    "label": "Terrazzo",
    "sort": 5
  },
  {
    "id": "334f8717-6c20-4113-b067-9a1b31c52410",
    "attributeId": "1d0e39c4-84a2-4586-9573-0fca5d4ffcb1",
    "value": "matte",
    "label": "Matte",
    "sort": 0
  },
  {
    "id": "a26a67d6-ddd5-4fc8-9ae5-7d93c665fe4a",
    "attributeId": "1d0e39c4-84a2-4586-9573-0fca5d4ffcb1",
    "value": "gloss",
    "label": "Gloss",
    "sort": 1
  },
  {
    "id": "a7f940c6-a44f-41f0-8235-b8989096ebc1",
    "attributeId": "1d0e39c4-84a2-4586-9573-0fca5d4ffcb1",
    "value": "polished",
    "label": "Polished",
    "sort": 2
  },
  {
    "id": "27e3199a-5ef4-408c-8d52-6b57d41741ef",
    "attributeId": "1d0e39c4-84a2-4586-9573-0fca5d4ffcb1",
    "value": "textured",
    "label": "Textured",
    "sort": 3
  },
  {
    "id": "73ba188b-9ec9-4a98-97ff-caaf60547e38",
    "attributeId": "1d0e39c4-84a2-4586-9573-0fca5d4ffcb1",
    "value": "anti-slip",
    "label": "Anti-Slip",
    "sort": 4
  },
  {
    "id": "3a1a39ac-1a15-44c5-bb06-2a56dd66a785",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "1/2in",
    "label": "1/2in",
    "sort": 0
  },
  {
    "id": "fdefb3c5-04c2-4c60-adac-7ba159b6f6ca",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "3/4in",
    "label": "3/4in",
    "sort": 1
  },
  {
    "id": "bc3ba012-f536-4f10-b057-33f7bb0910d7",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "1in",
    "label": "1in",
    "sort": 2
  },
  {
    "id": "3571ae0e-ade6-4787-a879-3fde1065b864",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "1.5in",
    "label": "1.5in",
    "sort": 3
  },
  {
    "id": "fae4b1a1-97be-450d-b3f6-05ccc03e956f",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "2in",
    "label": "2in",
    "sort": 4
  },
  {
    "id": "e7f8c648-3492-4906-8944-6f49b49f0582",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "3in",
    "label": "3in",
    "sort": 5
  },
  {
    "id": "fc2b0112-2c57-4869-9e84-794b95344995",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "4in",
    "label": "4in",
    "sort": 6
  },
  {
    "id": "b3980a5a-301d-4da0-b4c0-e54163187259",
    "attributeId": "107c1b15-a521-48c5-bb67-09beff2a45da",
    "value": "6in",
    "label": "6in",
    "sort": 7
  },
  {
    "id": "7e1a8bee-1292-4254-828a-19ae79f49790",
    "attributeId": "396a6d6f-4d9b-4f81-a4b8-560dafcc2133",
    "value": "pvc",
    "label": "PVC",
    "sort": 0
  },
  {
    "id": "62f8c99f-7754-432f-86f4-bea9ced345b4",
    "attributeId": "396a6d6f-4d9b-4f81-a4b8-560dafcc2133",
    "value": "cpvc",
    "label": "CPVC",
    "sort": 1
  },
  {
    "id": "76fbb402-57dd-468c-8f57-b25b90dd88e9",
    "attributeId": "396a6d6f-4d9b-4f81-a4b8-560dafcc2133",
    "value": "ppr",
    "label": "PPR",
    "sort": 2
  },
  {
    "id": "2c4cc52a-e0a1-4811-b7fe-f95089507f64",
    "attributeId": "396a6d6f-4d9b-4f81-a4b8-560dafcc2133",
    "value": "copper",
    "label": "Copper",
    "sort": 3
  },
  {
    "id": "63d29249-da50-431d-a05f-622fa7019015",
    "attributeId": "396a6d6f-4d9b-4f81-a4b8-560dafcc2133",
    "value": "galvanized",
    "label": "Galvanized",
    "sort": 4
  },
  {
    "id": "32b2b8e2-28f7-42ce-afe3-c26405ef479a",
    "attributeId": "396a6d6f-4d9b-4f81-a4b8-560dafcc2133",
    "value": "pex",
    "label": "PEX",
    "sort": 5
  },
  {
    "id": "227864ad-3229-4887-b3dd-4e51e4336b43",
    "attributeId": "cf4eae7f-c4bc-4314-b05d-fd02062743b7",
    "value": "sdr 26",
    "label": "SDR 26",
    "sort": 0
  },
  {
    "id": "8e50b814-f78e-4604-8618-255e019549e3",
    "attributeId": "cf4eae7f-c4bc-4314-b05d-fd02062743b7",
    "value": "sdr 41",
    "label": "SDR 41",
    "sort": 1
  },
  {
    "id": "6b45e390-3f31-4bbf-bab9-c0d1e5cb6d90",
    "attributeId": "cf4eae7f-c4bc-4314-b05d-fd02062743b7",
    "value": "schedule 40",
    "label": "Schedule 40",
    "sort": 2
  },
  {
    "id": "2c302707-fa52-4acc-9ae3-59d8e2185475",
    "attributeId": "cf4eae7f-c4bc-4314-b05d-fd02062743b7",
    "value": "schedule 80",
    "label": "Schedule 80",
    "sort": 3
  },
  {
    "id": "cdf84e66-ebd8-49af-9190-609aa3578516",
    "attributeId": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "value": "14 awg",
    "label": "14 AWG",
    "sort": 0
  },
  {
    "id": "3f16fac7-4941-46c3-b2ff-5b97e3f6a76a",
    "attributeId": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "value": "12 awg",
    "label": "12 AWG",
    "sort": 1
  },
  {
    "id": "d77db163-8521-4242-835d-a40fc8ce8b51",
    "attributeId": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "value": "10 awg",
    "label": "10 AWG",
    "sort": 2
  },
  {
    "id": "1411012b-0151-41a0-a7d3-cc7bd2705c77",
    "attributeId": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "value": "8 awg",
    "label": "8 AWG",
    "sort": 3
  },
  {
    "id": "2489ac9c-2612-43ac-8ef0-fbf632898938",
    "attributeId": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "value": "6 awg",
    "label": "6 AWG",
    "sort": 4
  },
  {
    "id": "dc23150a-c820-4bdf-8f67-ab3d3d117a18",
    "attributeId": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "value": "4 awg",
    "label": "4 AWG",
    "sort": 5
  },
  {
    "id": "4d60f2c4-5035-42d5-886e-b64a7849045a",
    "attributeId": "cfd15874-5bd9-4c73-9868-1c0632f6e982",
    "value": "2 awg",
    "label": "2 AWG",
    "sort": 6
  },
  {
    "id": "8c0448b9-15dd-45fa-8f70-d3e5f9cdd64d",
    "attributeId": "e869dcf1-6398-4eec-983c-1576c4567956",
    "value": "thhn",
    "label": "THHN",
    "sort": 0
  },
  {
    "id": "2786549e-b94a-492a-9e01-413e01dd4686",
    "attributeId": "e869dcf1-6398-4eec-983c-1576c4567956",
    "value": "nm-b",
    "label": "NM-B",
    "sort": 1
  },
  {
    "id": "0247a7f5-0a04-411c-b65c-1189d31c9600",
    "attributeId": "e869dcf1-6398-4eec-983c-1576c4567956",
    "value": "armoured",
    "label": "Armoured",
    "sort": 2
  },
  {
    "id": "a2f6d4b7-984e-4464-9230-b76d083c1b17",
    "attributeId": "e869dcf1-6398-4eec-983c-1576c4567956",
    "value": "flex",
    "label": "Flex",
    "sort": 3
  },
  {
    "id": "3aa61083-bf33-468a-9d9a-dc19db70353c",
    "attributeId": "e869dcf1-6398-4eec-983c-1576c4567956",
    "value": "coaxial",
    "label": "Coaxial",
    "sort": 4
  },
  {
    "id": "064d537a-6216-4cd4-b636-7b7fa399814d",
    "attributeId": "e869dcf1-6398-4eec-983c-1576c4567956",
    "value": "cat6",
    "label": "Cat6",
    "sort": 5
  },
  {
    "id": "a18b8404-38f9-4556-b600-fceeba37bc09",
    "attributeId": "d9d66b6e-4e3c-45be-8233-b6179a7ed78d",
    "value": "copper",
    "label": "Copper",
    "sort": 0
  },
  {
    "id": "da227850-d091-4990-823b-79e340532d0e",
    "attributeId": "d9d66b6e-4e3c-45be-8233-b6179a7ed78d",
    "value": "aluminium",
    "label": "Aluminium",
    "sort": 1
  },
  {
    "id": "71dde526-fc14-4a51-8f61-de0bd7cd8631",
    "attributeId": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "value": "emulsion",
    "label": "Emulsion",
    "sort": 0
  },
  {
    "id": "7dc039aa-5b4c-4e71-aeb7-d1c5523ae79c",
    "attributeId": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "value": "oil",
    "label": "Oil",
    "sort": 1
  },
  {
    "id": "160f9add-b588-4477-83e8-e2619bc47a25",
    "attributeId": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "value": "acrylic",
    "label": "Acrylic",
    "sort": 2
  },
  {
    "id": "7567f574-32de-452c-bd72-937f6e809539",
    "attributeId": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "value": "enamel",
    "label": "Enamel",
    "sort": 3
  },
  {
    "id": "348a3f12-89c7-4d1b-a8d8-e54c69326dac",
    "attributeId": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "value": "primer",
    "label": "Primer",
    "sort": 4
  },
  {
    "id": "bfa9ca6a-09be-4004-a6b5-f384151234d3",
    "attributeId": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "value": "sealer",
    "label": "Sealer",
    "sort": 5
  },
  {
    "id": "7d711c11-8803-4e2d-9596-df21393de368",
    "attributeId": "90d39848-e9f1-413c-8455-f36b26c254a7",
    "value": "waterproofing",
    "label": "Waterproofing",
    "sort": 6
  },
  {
    "id": "460f3677-7185-4175-9708-a0d246865fe5",
    "attributeId": "244f7fab-70af-4241-a407-c03829f562ba",
    "value": "matte",
    "label": "Matte",
    "sort": 0
  },
  {
    "id": "bb891896-3395-41dc-94a0-be77c56f3f4e",
    "attributeId": "244f7fab-70af-4241-a407-c03829f562ba",
    "value": "eggshell",
    "label": "Eggshell",
    "sort": 1
  },
  {
    "id": "7ced53f0-f8f6-4c0e-95c3-72388c65115e",
    "attributeId": "244f7fab-70af-4241-a407-c03829f562ba",
    "value": "satin",
    "label": "Satin",
    "sort": 2
  },
  {
    "id": "b797212d-3530-4d20-a508-fd3da0ec235e",
    "attributeId": "244f7fab-70af-4241-a407-c03829f562ba",
    "value": "semi-gloss",
    "label": "Semi-Gloss",
    "sort": 3
  },
  {
    "id": "d804473d-3ac3-4323-9be4-8df1a9bfd68f",
    "attributeId": "244f7fab-70af-4241-a407-c03829f562ba",
    "value": "gloss",
    "label": "Gloss",
    "sort": 4
  },
  {
    "id": "9ba8cc04-d814-41a5-8199-f19c90355288",
    "attributeId": "f9bb0679-f192-45db-af0f-8cea98f50330",
    "value": "white",
    "label": "White",
    "sort": 0
  },
  {
    "id": "dbc40e47-802b-4a33-bb16-8062d8f194db",
    "attributeId": "f9bb0679-f192-45db-af0f-8cea98f50330",
    "value": "pastel",
    "label": "Pastel",
    "sort": 1
  },
  {
    "id": "371ebb83-3d21-4afa-8ed8-4a62b2043eae",
    "attributeId": "f9bb0679-f192-45db-af0f-8cea98f50330",
    "value": "deep",
    "label": "Deep",
    "sort": 2
  },
  {
    "id": "744b8e54-e2f7-4b19-b156-a465d9ef0bf4",
    "attributeId": "f9bb0679-f192-45db-af0f-8cea98f50330",
    "value": "accent",
    "label": "Accent",
    "sort": 3
  },
  {
    "id": "d2f2c6a2-edc9-4fbd-92a4-d912db28f34c",
    "attributeId": "a0497069-f0d3-454d-96a3-b9e531892cb1",
    "value": "1qt",
    "label": "1qt",
    "sort": 0
  },
  {
    "id": "a4e177fd-476e-482d-9350-b1da964765d3",
    "attributeId": "a0497069-f0d3-454d-96a3-b9e531892cb1",
    "value": "1gal",
    "label": "1gal",
    "sort": 1
  },
  {
    "id": "2f893a06-1087-4558-ae1b-2d6d8a065dc4",
    "attributeId": "a0497069-f0d3-454d-96a3-b9e531892cb1",
    "value": "5gal",
    "label": "5gal",
    "sort": 2
  },
  {
    "id": "a9e1fa8b-697a-4f4c-976b-9d6219967122",
    "attributeId": "a0497069-f0d3-454d-96a3-b9e531892cb1",
    "value": "55gal",
    "label": "55gal",
    "sort": 3
  },
  {
    "id": "fab82525-a04e-4465-b5d0-f997f28670dd",
    "attributeId": "2386da74-122d-417d-973c-2fb51536a3a6",
    "value": "door",
    "label": "Door",
    "sort": 0
  },
  {
    "id": "7fb5aa26-59c5-47ca-a555-4d6efc43759e",
    "attributeId": "2386da74-122d-417d-973c-2fb51536a3a6",
    "value": "window",
    "label": "Window",
    "sort": 1
  },
  {
    "id": "3d1cfca0-258c-4d4b-8cd6-8ccd90173402",
    "attributeId": "2386da74-122d-417d-973c-2fb51536a3a6",
    "value": "door frame",
    "label": "Door Frame",
    "sort": 2
  },
  {
    "id": "6407280b-a504-4477-a75f-544ee52e0498",
    "attributeId": "2386da74-122d-417d-973c-2fb51536a3a6",
    "value": "window frame",
    "label": "Window Frame",
    "sort": 3
  },
  {
    "id": "069bea06-499e-45b6-b446-ded0dee8e277",
    "attributeId": "2386da74-122d-417d-973c-2fb51536a3a6",
    "value": "louvre",
    "label": "Louvre",
    "sort": 4
  },
  {
    "id": "14d4841e-437f-4945-b5fb-f4bc1d405e8c",
    "attributeId": "5e4c6361-724c-4b76-9207-3dc59e1e061a",
    "value": "wood",
    "label": "Wood",
    "sort": 0
  },
  {
    "id": "ff0d695b-8c3e-492a-9b8b-104de15305e2",
    "attributeId": "5e4c6361-724c-4b76-9207-3dc59e1e061a",
    "value": "steel",
    "label": "Steel",
    "sort": 1
  },
  {
    "id": "62484b5d-7afa-4baf-a299-544abd64acd9",
    "attributeId": "5e4c6361-724c-4b76-9207-3dc59e1e061a",
    "value": "aluminium",
    "label": "Aluminium",
    "sort": 2
  },
  {
    "id": "ff152596-bd0d-4937-b8c4-a9b1052bd414",
    "attributeId": "5e4c6361-724c-4b76-9207-3dc59e1e061a",
    "value": "pvc",
    "label": "PVC",
    "sort": 3
  },
  {
    "id": "6ddd4e10-8e5a-4b5f-af68-36d212d2d859",
    "attributeId": "5e4c6361-724c-4b76-9207-3dc59e1e061a",
    "value": "glass",
    "label": "Glass",
    "sort": 4
  },
  {
    "id": "2eee12f1-925d-4ab1-ae68-0a6b0aed293e",
    "attributeId": "9858d516-5f04-4805-b251-d675943660cb",
    "value": "nail",
    "label": "Nail",
    "sort": 0
  },
  {
    "id": "559bdd32-2e73-4ee3-8cad-1fd2ceb1ef62",
    "attributeId": "9858d516-5f04-4805-b251-d675943660cb",
    "value": "screw",
    "label": "Screw",
    "sort": 1
  },
  {
    "id": "9ba0115f-654f-43ba-8c74-a41b61fdd65d",
    "attributeId": "9858d516-5f04-4805-b251-d675943660cb",
    "value": "bolt",
    "label": "Bolt",
    "sort": 2
  },
  {
    "id": "de91aca6-2f31-40bc-aba7-ca78da985c85",
    "attributeId": "9858d516-5f04-4805-b251-d675943660cb",
    "value": "anchor",
    "label": "Anchor",
    "sort": 3
  },
  {
    "id": "a9a77469-33be-4efd-8da9-68679a56fcd5",
    "attributeId": "9858d516-5f04-4805-b251-d675943660cb",
    "value": "washer",
    "label": "Washer",
    "sort": 4
  },
  {
    "id": "170d1e10-a28f-41e4-93db-0be7e71bed83",
    "attributeId": "9858d516-5f04-4805-b251-d675943660cb",
    "value": "nut",
    "label": "Nut",
    "sort": 5
  },
  {
    "id": "34387f61-88a6-4a98-953d-92cb0815adc3",
    "attributeId": "9858d516-5f04-4805-b251-d675943660cb",
    "value": "tie wire",
    "label": "Tie Wire",
    "sort": 6
  },
  {
    "id": "e9c06528-369a-46ee-a0dc-6ce268c6a91c",
    "attributeId": "ef4907d2-90a6-4a86-b26e-4b4a37fa120c",
    "value": "galvanized",
    "label": "Galvanized",
    "sort": 0
  },
  {
    "id": "eed13019-a655-4826-9d54-7caae004b1e3",
    "attributeId": "ef4907d2-90a6-4a86-b26e-4b4a37fa120c",
    "value": "stainless",
    "label": "Stainless",
    "sort": 1
  },
  {
    "id": "c91ccf14-3a1e-4468-ab50-e08800b738df",
    "attributeId": "ef4907d2-90a6-4a86-b26e-4b4a37fa120c",
    "value": "zinc-plated",
    "label": "Zinc-Plated",
    "sort": 2
  },
  {
    "id": "a632b310-40a2-4a97-8785-6bb03c80e6fa",
    "attributeId": "ef4907d2-90a6-4a86-b26e-4b4a37fa120c",
    "value": "black",
    "label": "Black",
    "sort": 3
  }
];

export const CURATED_UNITS: CuratedUnit[] = [
  {
    "id": "553a0fa5-1d73-484a-be1f-4f0f075a9090",
    "key": "ea",
    "label": "Each",
    "sort": 0
  },
  {
    "id": "6f64eea9-3afc-4d67-a1c3-f6d4b65ba906",
    "key": "bag",
    "label": "Bag",
    "sort": 1
  },
  {
    "id": "e077a190-e1b8-46e7-b0b9-259284be8768",
    "key": "sheet",
    "label": "Sheet",
    "sort": 2
  },
  {
    "id": "eeea25c8-c203-4f24-8de9-00db28726df2",
    "key": "length",
    "label": "Length",
    "sort": 3
  },
  {
    "id": "2169ec8d-f3c0-42f9-a5c7-0dfc14a2f38b",
    "key": "box",
    "label": "Box",
    "sort": 4
  },
  {
    "id": "ac08e71e-1de7-4998-9f2b-d2a700bfd6bb",
    "key": "roll",
    "label": "Roll",
    "sort": 5
  },
  {
    "id": "95090bde-b493-42ba-887e-fac45be37773",
    "key": "bundle",
    "label": "Bundle",
    "sort": 6
  },
  {
    "id": "928e812f-d19e-4446-93d0-bea7bdb8476a",
    "key": "gal",
    "label": "Gallon",
    "sort": 7
  },
  {
    "id": "2b99943f-8115-472f-bcd5-af2d7ee74c25",
    "key": "litre",
    "label": "Litre",
    "sort": 8
  },
  {
    "id": "72973ab7-031c-4326-a48a-756ed4be868a",
    "key": "sqft",
    "label": "Square Foot",
    "sort": 9
  },
  {
    "id": "1ad61fce-1bc5-4e77-b10e-b894767acf3c",
    "key": "linft",
    "label": "Linear Foot",
    "sort": 10
  },
  {
    "id": "5fb7e128-4ffb-4a54-b97b-2322430747c6",
    "key": "boardft",
    "label": "Board Foot",
    "sort": 11
  },
  {
    "id": "17471bd0-d424-4f03-81fa-bbeaaa33bf1f",
    "key": "cuyd",
    "label": "Cubic Yard",
    "sort": 12
  },
  {
    "id": "cceba620-33a2-47a6-b226-431838b19244",
    "key": "tonne",
    "label": "Tonne",
    "sort": 13
  },
  {
    "id": "85139e49-e829-41a8-a8dd-101a0fd3c5f7",
    "key": "kg",
    "label": "Kilogram",
    "sort": 14
  },
  {
    "id": "2f75505e-4fe2-46f9-ba08-aefc442f213d",
    "key": "m",
    "label": "Metre",
    "sort": 15
  },
  {
    "id": "8d8c48cf-a8bb-4450-9103-1395c0ddb088",
    "key": "sqm",
    "label": "Square Metre",
    "sort": 16
  }
];

/**
 * Legacy free-text category string -> curated category key. Used by the 2a
 * migration and by MaterialSchemaService when reading a pre-2a row whose
 * categoryDefId was never backfilled.
 */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "Steel / Rebar": "steel-rebar",
  "Blocks": "blocks",
  "Lumber": "lumber",
  "Cement": "cement",
  "Aggregate / Sand": "aggregate-sand",
  "Roofing": "roofing",
  "Tiles": "tiles",
  "Plumbing": "plumbing",
  "Electrical": "electrical",
  "Paint": "paint",
  "Other": "other",
};

/**
 * Legacy spec KEY (a display label, pre-2a) -> curated attribute key. Pre-2a
 * specs were keyed by label ("Bag size"); 2a keys them by attribute key.
 */
export const LEGACY_SPEC_KEY_MAP: Record<string, string> = {
  "Diameter": "diameter",
  "Length": "length",
  "Size": "size",
  "Type": "type",
  "Dimension": "dimension",
  "Grade": "grade",
  "Bag size": "bagSize",
  "Finish": "finish",
  "Material": "material",
  "Gauge": "gauge",
};
