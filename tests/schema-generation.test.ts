import 'reflect-metadata'
import { describe, it, expect, beforeAll } from 'vitest'
import { z } from 'zod'

import {
  Args,
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
  Query,
  Resolver,
} from '@nestjs/graphql'
import { NestFactory } from '@nestjs/core'
import { SubscriptionWithZod } from '../src/decorators/query-types/subscription-with-zod'
import { lexicographicSortSchema, printSchema, type GraphQLSchema } from 'graphql'

import { modelFromZod } from '../src/model-from-zod'
import { inputFromZod, MutationWithZod, QueryWithZod, ZodArgs } from '../src'

// All schemas used by the resolvers below. Defined once so each generated
// model class is created once.
const TaskStatus = z
  .enum(['active', 'completed', 'archived'])
  .describe('TaskStatus: lifecycle of a task')
const UserStatus = z.enum(['active', 'inactive']) // Purposefully missing a description to test ClassFromZod_x_StatusEnum_y naming of nested enums

const Task = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    done: z.boolean().default(false),
    priority: z.number().int().default(0),
    status: TaskStatus,
  })
  .describe('Task: a unit of work')

const TaskInput = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    status: TaskStatus,
  })
  .describe('TaskInput: input for creating a task')

// Flat filter used as a parameter argument. ZodArgs registers its input
// schema via inputFromZod, which today doesn't recurse into nested
// ZodObjects (those would need their own @InputType registration), so the
// schemas exposed via @ZodArgs are kept primitive on purpose.
const UserFilter = z
  .object({
    search: z.string().optional(),
    minAge: z.number().int().optional(),
  })
  .describe('UserFilter: filter parameters for the user query')

const Profile = z
  .object({
    email: z.email(),
    homepage: z.url().optional(),
  })
  .describe('Profile: external identifiers for a user')

const UserFull = z.object({
  id: z.uuid(),
  name: z.string(),
  age: z.number().int().default(0),
  bio: z.string().nullable(),
  profile: Profile,
  tags: z.array(z.string()),
  status: UserStatus,
})

const User = UserFull.omit({ status: true }).describe('User: an account holder')

const AuditLog = z
  .object({
    id: z.string(),
    action: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime().optional(),
  })
  .describe('AuditLog: a record of an action taken in the system')

const WrappedDefaultsInput = z.object({
  plain: z.string().default('plain_value'),
  readonlyDefault: z.string().default('readonly_value').readonly(),
  optionalDefault: z.string().default('optional_value').optional(),
  stackedDefault: z.string().default('stacked_value').optional().readonly(),
  prefaulted: z.string().prefault('prefault_value'),
})

const TagPriority = z.enum(['low', 'medium', 'high']).describe('TagPriority: priority of a tag')
const Tag = z
  .object({
    label: z.string(),
    color: z.string().optional(),
    priority: TagPriority,
  })
  .describe('Tag: a label with optional color')
const TagArray = z.array(Tag).describe('Tags: a list of tag')

const TaskModel = modelFromZod(Task, { name: 'Task' })
const UserModel = modelFromZod(User, { name: 'User' })
const UserFullModel = modelFromZod(UserFull)
const TaskInputModel = inputFromZod(TaskInput, { name: 'TaskInput' })
const AuditLogModel = modelFromZod(AuditLog, {
  name: 'AuditLog',
  description: 'A record of an action taken in the system',
})
const WrappedDefaultsInputModel = inputFromZod(WrappedDefaultsInput, {
  name: 'WrappedDefaultsInput',
})

@Resolver(() => TaskModel)
class TaskResolver {
  @QueryWithZod(Task)
  task() {
    return {
      id: '1',
      title: 'demo',
      description: undefined,
      done: false,
      priority: 0,
      status: 'active',
    }
  }

  @QueryWithZod(Task, 'task2')
  taskMismatchName(): z.infer<typeof Task> {
    return {
      id: '3',
      title: 'listed',
      description: 'a task description',
      done: true,
      priority: -5,
      status: 'archived',
    }
  }

  @MutationWithZod(Task)
  createTask(@Args('input', { type: () => TaskInputModel }) _input: unknown) {
    return {
      id: '2',
      title: 'created',
      description: undefined,
      done: false,
      priority: 1,
      status: 'completed',
    }
  }

  @QueryWithZod(Task.array())
  filteredTasks(
    @ZodArgs(z.boolean().default(false), 'showAll') _showAll: boolean,
    @ZodArgs(
      z.enum(['high', 'medium', 'low']).optional().describe('Priority of the task'),
      'priority',
    )
    _priority?: ('high' | 'medium' | 'low')[],
    @ZodArgs(z.array(z.keyof(Task)).optional(), 'selectedFields')
    _selectedFields?: (keyof z.infer<typeof Task>)[],
  ) {
    return [{ id: '1', title: 'demo', done: false, priority: 0, status: 'active' as const }]
  }

  @MutationWithZod(Task)
  tagTask(
    @ZodArgs(z.string(), 'taskId') _taskId: string,
    @ZodArgs(TagArray, 'tags') _tags: z.infer<typeof TagArray>,
    @ZodArgs(Tag.array(), 'tagsAlt') _tagsAlt: z.infer<typeof Tag>[],
  ) {
    return { id: '1', title: 'demo', done: false, priority: 0, status: 'active' as const }
  }
}

@Resolver(() => UserModel)
class UserResolver {
  @QueryWithZod(User)
  user(@ZodArgs(UserFilter) _filter: ZodArgs.Of<typeof UserFilter>) {
    return {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Alice',
      age: 30,
      bio: null,
      profile: { email: 'alice@example.com', homepage: undefined },
      tags: ['admin'],
    }
  }

  @Query(() => UserFullModel)
  async user2() {
    return {
      id: 'b69b8a5d-354e-481e-b263-08fcc7dcb895',
      name: 'Bob',
      age: 25,
      bio: 'A user without a profile',
      profile: { email: 'bob@example.com', homepage: undefined },
      tags: [],
    }
  }

  @Query(() => UserModel, {
    name: 'user5',
    description: 'Test overriding the name and description of the query',
  })
  async user3() {
    return {
      id: '054d76a6-3954-43b1-a0d3-6690834d4a8b',
      name: 'Charlie',
      age: 40,
      bio: 'A user without a profile',
      profile: { email: 'charlie@example.com' },
      tags: [],
    }
  }
}

@Resolver(() => AuditLogModel)
class AuditLogResolver {
  @Query(() => [AuditLogModel], { description: 'Audit logs for the system' })
  auditLogs() {
    return []
  }
}

@Resolver()
class TaskSubscriptionResolver {
  // String-name overload — exercises the `Subscription(nameOrOptions)` branch.
  @SubscriptionWithZod(Task, 'taskCreated')
  taskCreated() {
    return null
  }

  // Object-options overload — already passes `() => model`.
  @SubscriptionWithZod(Task, { name: 'taskUpdated', description: 'Fires when a task is updated' })
  taskUpdated() {
    return null
  }
}

// @Resolver() is purposefully omitted here to ensure that
// @Query() doesn't require it by mistake.
class WrappedDefaultsResolver {
  @Query(() => String)
  accept(@Args('input', { type: () => WrappedDefaultsInputModel }) _input: unknown) {
    return 'ok'
  }
}

let schema: GraphQLSchema
// Mirror a typical schema-generation script: lexicographicSortSchema +
// printSchema. Sorting gives a deterministic SDL ordering so we can pin it
// down with an inline snapshot.
let sortedSdl: string

beforeAll(async () => {
  const app = await NestFactory.createApplicationContext(GraphQLSchemaBuilderModule, {
    logger: false,
    abortOnError: false,
  })
  const factory = app.get(GraphQLSchemaFactory)
  schema = await factory.create([
    TaskResolver,
    UserResolver,
    AuditLogResolver,
    TaskSubscriptionResolver,
    WrappedDefaultsResolver,
  ])
  // Sorting the schema with lexicographicSortSchema so the output is stable across runs
  sortedSdl = printSchema(lexicographicSortSchema(schema))
  await app.close()
})

describe('end-to-end (e2e) schema generation', () => {
  it('should produce the expected sorted SDL', () => {
    // toMatchInlineSnapshot adds an extra " at the beginning and end of the snapshot
    expect(sortedSdl).toMatchInlineSnapshot(`
      """"A record of an action taken in the system"""
      type AuditLog {
        action: String!
        createdAt: String!
        id: String!
        updatedAt: String
      }

      type ClassFromZod_1 {
        age: Int!
        bio: String
        id: String!
        name: String!

        """Profile: external identifiers for a user"""
        profile: User_Profile!
        status: ClassFromZod_2_StatusEnum_2!
        tags: [String!]!
      }

      """Enum values for ClassFromZod_2.status"""
      enum ClassFromZod_2_StatusEnum_2 {
        active
        inactive
      }

      type Mutation {
        createTask(input: TaskInput!): Task!
        tagTask(
          """Tags: a list of tag"""
          tags: [Tag!]!

          """Tag: a label with optional color"""
          tagsAlt: [Tag!]!
          taskId: String!
        ): Task!
      }

      """Enum values for priority.priority"""
      enum Priority_PriorityEnum_3 {
        high
        low
        medium
      }

      type Query {
        accept(input: WrappedDefaultsInput!): String!

        """Audit logs for the system"""
        auditLogs: [AuditLog!]!
        filteredTasks(
          """Priority of the task"""
          priority: Priority_PriorityEnum_3
          selectedFields: [SelectedFields_SelectedFieldsEnum_3!]
          showAll: Boolean! = false
        ): [Task!]!
        task: Task!
        task2: Task!
        user(arg_0: UserFilter!): User!
        user2: ClassFromZod_1!

        """Test overriding the name and description of the query"""
        user5: User!
      }

      """Enum values for selectedFields.selectedFields"""
      enum SelectedFields_SelectedFieldsEnum_3 {
        description
        done
        id
        priority
        status
        title
      }

      type Subscription {
        taskCreated: Task!

        """Fires when a task is updated"""
        taskUpdated: Task!
      }

      """Tag: a label with optional color"""
      input Tag {
        color: String
        label: String!

        """TagPriority: priority of a tag"""
        priority: Tag_PriorityEnum_3!
      }

      """TagPriority: priority of a tag"""
      enum Tag_PriorityEnum_3 {
        high
        low
        medium
      }

      """Task: a unit of work"""
      type Task {
        description: String
        done: Boolean!
        id: String!
        priority: Int!

        """TaskStatus: lifecycle of a task"""
        status: TaskInput_StatusEnum_2!
        title: String!
      }

      input TaskInput {
        description: String

        """TaskStatus: lifecycle of a task"""
        status: TaskInput_StatusEnum_2!
        title: String!
      }

      """TaskStatus: lifecycle of a task"""
      enum TaskInput_StatusEnum_2 {
        active
        archived
        completed
      }

      """User: an account holder"""
      type User {
        age: Int!
        bio: String
        id: String!
        name: String!

        """Profile: external identifiers for a user"""
        profile: User_Profile!
        tags: [String!]!
      }

      """filter parameters for the user query"""
      input UserFilter {
        minAge: Int
        search: String
      }

      """Profile: external identifiers for a user"""
      type User_Profile {
        email: String!
        homepage: String
      }

      input WrappedDefaultsInput {
        optionalDefault: String = "optional_value"
        plain: String! = "plain_value"
        prefaulted: String! = "prefault_value"
        readonlyDefault: String! = "readonly_value"
        stackedDefault: String = "stacked_value"
      }"
    `)
  })
})
