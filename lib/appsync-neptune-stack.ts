import { Construct } from "constructs";
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as neptune from '@aws-cdk/aws-neptune-alpha';

export class AppsyncNeptuneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const api = new appsync.GraphqlApi(this, 'Api', {
      name: 'NeptuneAPI',
      schema: appsync.SchemaFile.fromAsset('graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY
        },
      },
    })

    const vpc = new ec2.Vpc(this, 'NewNeptuneVPC');
    const region = cdk.Stack.of(this).region
    const lambdaFn = new lambda.Function(this, 'Lambda Function', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'main.handler',
      code: lambda.Code.fromAsset('lambda-fns'),
      memorySize: 1024,
      vpc,
      // This adds and enables ADOT auto instrument
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      layers: [lambda.LayerVersion.fromLayerVersionArn(this, 'LambdaLayer',
        `arn:aws:lambda:${region}:901920570463:layer:aws-otel-nodejs-amd64-ver-1-13-0:2`
      )]
    })
    lambdaFn.addEnvironment('AWS_LAMBDA_EXEC_WRAPPER', '/opt/otel-handler')

    // set the new Lambda function as a data source for the AppSync API
    const lambdaDs = api.addLambdaDataSource('lambdaDatasource', lambdaFn);

    lambdaDs.createResolver("LambdaQueryResolver", {
      typeName: "Query",
      fieldName: "listPosts"
    })
    lambdaDs.createResolver("LambdaMutationResolver", {
      typeName: "Mutation",
      fieldName: "createPost"
    })

    // setup neptune cluster
    const clusterSecurityGroup = new ec2.SecurityGroup(this, 'ClusterSecurityGroup', {
      vpc,
      description: 'Allow neptune access',
      allowAllOutbound: true,
      disableInlineRules: true
    });
    clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8182), 'allow neptune access from vpc');
    const cluster = new neptune.DatabaseCluster(this, 'NeptuneCluster', {
      vpc,
      instanceType: neptune.InstanceType.R5_LARGE,
      securityGroups: [clusterSecurityGroup]
    })

    const writeAddress = cluster.clusterEndpoint.socketAddress;
    new cdk.CfnOutput(this, 'WriteAddress', {
      value: writeAddress
    })

    const readAddress = cluster.clusterReadEndpoint.socketAddress
    new cdk.CfnOutput(this, 'ReadAddress', {
      value: readAddress
    })

    lambdaFn.addEnvironment('WRITER', writeAddress)
    lambdaFn.addEnvironment('READER', readAddress)
  }
}
